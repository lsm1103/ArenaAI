'use client'

import { useState, useEffect, useRef } from 'react'
import { VideoList } from './VideoList'
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer'
import { TimelineEditor } from './TimelineEditor'
import { AnnotationResults } from './AnnotationResults'
import { TopActions } from './TopActions'
import { SettingsDialog } from './SettingsDialog'
// import { ToolBar } from './ToolBar'
import { ResizablePanel } from './ResizablePanel'
import { Button } from '@/components/ui/button'
import { EyeOff } from 'lucide-react'

interface AnnotationInterfaceProps {
  folderPath: string
  selectedVideos?: VideoFile[]
  onReset: () => void
}

export interface VideoFile {
  name: string
  path: string
  thumbnail?: string
}

export interface TimelineAnnotation {
  id: string
  type: 'segment' | 'timestamp'
  startTime: number
  endTime?: number
  label: string
  description?: string
  trackIndex?: number
}

export interface VideoAnnotation {
  videoPath: string
  timeline: TimelineAnnotation[]
  labels: string[]
  descriptions: string[]
}

export function AnnotationInterface({ folderPath, selectedVideos, onReset }: AnnotationInterfaceProps) {
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null)
  const [currentAnnotation, setCurrentAnnotation] = useState<VideoAnnotation>({
    videoPath: '',
    timeline: [],
    labels: [],
    descriptions: []
  })
  const [showSettings, setShowSettings] = useState(false)
  const [availableLabels, setAvailableLabels] = useState<string[]>(['标签1', '标签2', '标签3'])
  const [selectedTool, setSelectedTool] = useState<'pointer' | 'segment' | 'timestamp'>('pointer')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isListVisible, setIsListVisible] = useState(true)
  const videoPlayerRef = useRef<VideoPlayerRef>(null)

  useEffect(() => {
    // 如果有预选的视频文件，直接使用它们
    if (selectedVideos && selectedVideos.length > 0) {
      setVideos(selectedVideos)
      setCurrentVideo(selectedVideos[0])
      setCurrentAnnotation({
        videoPath: selectedVideos[0].path,
        timeline: [],
        labels: [],
        descriptions: []
      })
      return
    }

    const loadVideosFromFolder = async () => {
      if (!folderPath) return

      try {
        // 尝试使用File System Access API读取文件夹
        if ('showDirectoryPicker' in window) {
          // 注意：这里我们需要重新选择文件夹，因为浏览器安全限制
          // 在实际应用中，你可能需要保存目录句柄
          console.log('正在尝试读取文件夹:', folderPath)
          
          // 由于浏览器限制，我们提供一个手动选择文件的方式
          const videoFiles: VideoFile[] = []
          
          // 创建一个文件输入元素来让用户选择视频文件
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.accept = 'video/*'
          
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files
            if (files) {
              const newVideos: VideoFile[] = Array.from(files).map((file, index) => ({
                name: file.name.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
                path: URL.createObjectURL(file), // 创建对象URL
                thumbnail: undefined
              }))
              
              setVideos(newVideos)
              if (newVideos.length > 0) {
                setCurrentVideo(newVideos[0])
                setCurrentAnnotation({
                  videoPath: newVideos[0].path,
                  timeline: [],
                  labels: [],
                  descriptions: []
                })
              }
            }
          }
          
          // 自动触发文件选择
          input.click()
          
        } else {
          // 降级处理：显示提示信息
          console.log('浏览器不支持File System Access API')
          alert('您的浏览器不支持自动读取文件夹。请使用文件选择功能来添加视频文件。')
        }
      } catch (error) {
        console.error('读取文件夹失败:', error)
        // 如果失败，显示mock数据作为示例
        const mockVideos: VideoFile[] = [
          { name: '示例视频1', path: `${folderPath}/video1.mp4` },
          { name: '示例视频2', path: `${folderPath}/video2.mp4` },
        ]
        setVideos(mockVideos)
        if (mockVideos.length > 0) {
          setCurrentVideo(mockVideos[0])
          setCurrentAnnotation({
            videoPath: mockVideos[0].path,
            timeline: [],
            labels: [],
            descriptions: []
          })
        }
      }
    }

    loadVideosFromFolder()
  }, [folderPath, selectedVideos])

  const handleVideoSelect = (video: VideoFile) => {
    setCurrentVideo(video)
    setCurrentAnnotation({
      videoPath: video.path,
      timeline: [],
      labels: [],
      descriptions: []
    })
  }

  const handleTimelineUpdate = (annotations: TimelineAnnotation[]) => {
    setCurrentAnnotation(prev => ({
      ...prev,
      timeline: annotations
    }))
  }

  const handleAnnotationAdd = (annotation: Omit<TimelineAnnotation, 'id'>) => {
    const newAnnotation: TimelineAnnotation = {
      ...annotation,
      id: Date.now().toString()
    }
    setCurrentAnnotation(prev => ({
      ...prev,
      timeline: [...prev.timeline, newAnnotation]
    }))
  }

  const handleAnnotationUpdate = (id: string, updates: Partial<TimelineAnnotation>) => {
    setCurrentAnnotation(prev => ({
      ...prev,
      timeline: prev.timeline.map(ann => 
        ann.id === id ? { ...ann, ...updates } : ann
      )
    }))
  }

  const handleAnnotationDelete = (id: string) => {
    setCurrentAnnotation(prev => ({
      ...prev,
      timeline: prev.timeline.filter(ann => ann.id !== id)
    }))
  }

  const handleTimeChange = (time: number) => {
    setCurrentTime(time)
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekTo(time)
    }
  }

  const handleSkip = (reason: string) => {
    console.log('跳过标注，原因：', reason)
    // 这里可以保存跳过记录
  }

  const handleComplete = () => {
    console.log('完成标注：', currentAnnotation)
    // 这里可以保存标注结果
  }

  const toggleListVisibility = () => {
    setIsListVisible((v) => !v)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="flex-shrink-0">
        <TopActions
          onSkip={handleSkip}
          onComplete={handleComplete}
          onSettings={() => setShowSettings(true)}
          onReset={onReset}
          isListVisible={isListVisible}
          onToggleList={toggleListVisibility}
        />
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ResizablePanel 
          key={isListVisible ? 'with-list' : 'no-list'}
          direction="horizontal" 
          initialSizes={isListVisible ? [15, 60, 25] : [75, 25]} 
          minSizes={isListVisible ? [10, 40, 20] : [60, 20]}
          className="h-full"
          disabledDividerIndices={isListVisible ? [0] : []}
        >
          {/* 左侧视频列表（可隐藏） */}
          {isListVisible && (
            <div className="bg-white border-r border-gray-200 overflow-hidden h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">数据列表</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleListVisibility}
                  className="flex items-center space-x-1"
                >
                  <EyeOff className="w-4 h-4" />
                  {/* <span>隐藏列表</span> */}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <VideoList
                  videos={videos}
                  currentVideo={currentVideo}
                  onVideoSelect={handleVideoSelect}
                />
              </div>
            </div>
          )}

          {/* 中间视频播放和时间轴区域 */}
          <div className="flex flex-col h-full overflow-hidden">
            <ResizablePanel 
              direction="vertical" 
              initialSizes={[68, 32]} 
              minSizes={[55, 25]}
              className="h-full"
              gutterSize={16}
            >
              {/* 视频播放器 */}
              <div className="bg-black flex items-center justify-center overflow-hidden h-full">
                {currentVideo ? (
                  <VideoPlayer 
                    ref={videoPlayerRef}
                    videoPath={currentVideo.path} 
                    onTimeUpdate={setCurrentTime}
                    onDurationChange={setDuration}
                  />
                ) : (
                  <div className="text-white text-center">
                    <p className="text-lg">请选择视频文件</p>
                  </div>
                )}
              </div>

              {/* 工具栏 + 时间轴（固定小工具栏 + 下方铺满） */}
              <TimelineEditor
                duration={duration}
                currentTime={currentTime}
                annotations={currentAnnotation.timeline}
                onTimeChange={handleTimeChange}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationUpdate={handleAnnotationUpdate}
                onAnnotationDelete={handleAnnotationDelete}
                selectedTool={selectedTool}
                onToolSelect={setSelectedTool}
                availableLabels={availableLabels}
              />
            </ResizablePanel>
          </div>

          {/* 右侧标注结果 */}
          <div className="bg-white border-l border-gray-200 h-full overflow-hidden">
            <AnnotationResults 
              annotation={currentAnnotation} 
              onAnnotationChange={setCurrentAnnotation}
              onTimelineAnnotationUpdate={handleAnnotationUpdate}
              onTimelineAnnotationDelete={handleAnnotationDelete}
              availableLabels={availableLabels}
            />
          </div>
        </ResizablePanel>
      </div>

      {/* 设置弹窗 */}
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        availableLabels={availableLabels}
        onLabelsChange={setAvailableLabels}
      />
    </div>
  )
}