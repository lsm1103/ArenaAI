'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { TimelineAnnotation } from './AnnotationInterface'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VideoTimelineProps {
  duration: number
  currentTime: number
  annotations: TimelineAnnotation[]
  onTimeChange: (time: number) => void
  onAnnotationAdd: (annotation: Omit<TimelineAnnotation, 'id'>) => void
  onAnnotationUpdate: (id: string, annotation: Partial<TimelineAnnotation>) => void
  onAnnotationDelete: (id: string) => void
  selectedTool: 'pointer' | 'segment' | 'timestamp'
  trackCount?: number
  tracks?: Array<{ id: string; name: string; locked: boolean; hidden: boolean }>
  availableLabels?: string[]
}

export function VideoTimeline({
  duration,
  currentTime,
  annotations,
  onTimeChange,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  selectedTool,
  trackCount = 1,
  tracks,
  availableLabels = ['标签1', '标签2', '标签3']
}: VideoTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const [showLabelDialog, setShowLabelDialog] = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    type: 'segment' | 'timestamp'
    startTime: number
    endTime?: number
    trackIndex: number
  } | null>(null)
  const [selectedDialogLabel, setSelectedDialogLabel] = useState('')
  const [activeSegDrag, setActiveSegDrag] = useState<{
    id: string
    type: 'move' | 'resize-start' | 'resize-end'
    initialStart: number
    initialEnd: number
    length: number
    offset?: number
  } | null>(null)

  const laneHeight = 24

  // tracks & visibility
  const totalTracks = tracks?.length ?? Math.max(1, trackCount)
  const visibleTrackIndices = tracks
    ? tracks.reduce<number[]>((acc, t, i) => { if (!t.hidden) acc.push(i); return acc }, [])
    : Array.from({ length: totalTracks }, (_, i) => i)
  const laneCount = Math.max(1, visibleTrackIndices.length)
  const visibleIndexToTrackIndex = (vIndex: number) => {
    if (!tracks) return Math.max(0, Math.min(vIndex, totalTracks - 1))
    if (visibleTrackIndices.length === 0) return 0
    const clamped = Math.max(0, Math.min(vIndex, visibleTrackIndices.length - 1))
    return visibleTrackIndices[clamped]
  }
  const trackIndexToVisibleIndex = (tIndex: number) => {
    if (!tracks) return Math.max(0, Math.min(tIndex, totalTracks - 1))
    return visibleTrackIndices.indexOf(tIndex)
  }

  // 时间格式化
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // 将像素位置转换为时间
  const pixelToTime = useCallback((pixel: number) => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const relativeX = pixel - rect.left
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width))
    return percentage * duration
  }, [duration])

  // 将时间转换为像素位置
  const timeToPixel = useCallback((time: number) => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const percentage = time / duration
    return percentage * rect.width
  }, [duration])

  const clientYToTrack = (clientY: number) => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height))
    const vIdx = Math.floor(y / laneHeight)
    return visibleIndexToTrackIndex(vIdx)
  }

  // 处理鼠标按下
  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === 'pointer') {
      // 指针工具：直接跳转时间
      const time = pixelToTime(e.clientX)
      onTimeChange(time)
    } else if (selectedTool === 'segment') {
      // 时间段工具：开始拖拽
      const time = pixelToTime(e.clientX)
      const trackIndex = clientYToTrack(e.clientY)
      if (tracks && tracks[trackIndex]?.locked) return
      setIsDragging(true)
      setDragStart(time)
      setDragEnd(time)
      setPendingAnnotation({ type: 'segment', startTime: time, endTime: time, trackIndex })
    } else if (selectedTool === 'timestamp') {
      // 时间戳工具：添加时间戳
      const time = pixelToTime(e.clientX)
      const trackIndex = clientYToTrack(e.clientY)
      if (tracks && tracks[trackIndex]?.locked) return
      setPendingAnnotation({ type: 'timestamp', startTime: time, trackIndex })
      setShowLabelDialog(true)
    }
  }

  // 处理鼠标移动
  const handleMouseMove = (e: React.MouseEvent) => {
    // 片段移动/拉伸交互
    if (activeSegDrag) {
      const MIN_LEN = 0.1
      const mouseTime = pixelToTime(e.clientX)
      if (activeSegDrag.type === 'move') {
        const newStart = Math.max(0, Math.min(mouseTime - (activeSegDrag.offset ?? 0), duration - activeSegDrag.length))
        const newEnd = newStart + activeSegDrag.length
        onAnnotationUpdate(activeSegDrag.id, { startTime: newStart, endTime: newEnd })
      } else if (activeSegDrag.type === 'resize-start') {
        const maxStart = activeSegDrag.initialEnd - MIN_LEN
        const newStart = Math.max(0, Math.min(mouseTime, maxStart))
        onAnnotationUpdate(activeSegDrag.id, { startTime: newStart })
      } else if (activeSegDrag.type === 'resize-end') {
        const minEnd = activeSegDrag.initialStart + MIN_LEN
        const newEnd = Math.min(duration, Math.max(mouseTime, minEnd))
        onAnnotationUpdate(activeSegDrag.id, { endTime: newEnd })
      }
      return
    }

    if (isDragging && dragStart !== null) {
      const time = pixelToTime(e.clientX)
      setDragEnd(time)
    }
  }

  // 处理鼠标释放
  const handleMouseUp = () => {
    if (activeSegDrag) {
      setActiveSegDrag(null)
    }
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const startTime = Math.min(dragStart, dragEnd)
      const endTime = Math.max(dragStart, dragEnd)
      
      if (endTime - startTime > 0.1) { // 最小时间段0.1秒
        setPendingAnnotation((prev) => ({
          type: 'segment',
          startTime,
          endTime,
          trackIndex: prev?.trackIndex ?? 0
        }))
        setShowLabelDialog(true)
      }
    }
    
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  // 处理标签选择
  const handleLabelSelect = (label: string) => {
    if (pendingAnnotation) {
      const annotation: Omit<TimelineAnnotation, 'id'> = {
        type: pendingAnnotation.type,
        startTime: pendingAnnotation.startTime,
        endTime: pendingAnnotation.endTime,
        label,
        description: '',
        trackIndex: pendingAnnotation.trackIndex
      }
      onAnnotationAdd(annotation)
    }
    setShowLabelDialog(false)
    setPendingAnnotation(null)
    setSelectedDialogLabel('')
  }

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        if (selectedTool === 'timestamp') {
          setPendingAnnotation({ type: 'timestamp', startTime: currentTime, trackIndex: 0 })
          setShowLabelDialog(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTime, selectedTool])

  // 生成时间刻度：固定为总时长的 1/100，主刻度每 10 个标注文本，所有刻度提供 hover 提示
  const generateTimeMarks = () => {
    const marks: ReactNode[] = []
    const divisions = 100
    if (duration <= 0) return marks

    for (let i = 0; i <= divisions; i++) {
      const percentage = (i / divisions) * 100
      const timeAtTick = (i / divisions) * duration
      const isMajor = i % 10 === 0

      marks.push(
        <div
          key={`tick-${i}`}
          className="absolute bottom-0 flex flex-col-reverse items-center group"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)', height: '100%' }}
        >
          {/* hover tips：贴紧标尺上方，默认隐藏 */}
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-lg z-50">
            {formatTime(timeAtTick)}
          </div>
          {/* 刻度线 */}
          <div className={`w-px ${isMajor ? 'h-3 bg-gray-400' : 'h-2 bg-gray-600'}`}></div>
          {/* 仅主刻度显示时间文本（置于刻度线上方）*/}
          {isMajor && (
            <span className="text-xs text-gray-400 mb-1">{formatTime(timeAtTick).split('.')[0]}</span>
          )}
        </div>
      )
    }
    return marks
  }

  return (
    <div className="bg-gray-900 text-white p-4 h-full min-h-32">
      {/* 时间轴标尺 */}
      <div className="relative h-10 mb-2 overflow-visible">
        {generateTimeMarks()}
      </div>

      {/* 主时间轴 */}
      <div
        ref={timelineRef}
        className={`relative bg-gray-800 rounded border border-gray-600 ${
          selectedTool === 'pointer' ? 'cursor-pointer' : 
          selectedTool === 'segment' ? 'cursor-crosshair' : 
          'cursor-crosshair'
        }`}
        style={{ height: laneCount * laneHeight }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 轨道背景分隔 */}
        {Array.from({ length: laneCount }).map((_, idx) => (
          <div
            key={`lane-${idx}`}
            className="absolute left-0 right-0 bg-gray-700/30 border-t border-gray-600"
            style={{ top: idx * laneHeight, height: laneHeight }}
          />
        ))}
        {/* 播放头 */}
        <div
          className="absolute top-0 w-0.5 h-full bg-red-500 z-20 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        >
          <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rotate-45"></div>
        </div>

        {/* 现有标注 */}
        {annotations.map((annotation) => {
          if (annotation.type === 'segment') {
            const left = (annotation.startTime / duration) * 100
            const width = ((annotation.endTime! - annotation.startTime) / duration) * 100
            const vIndex = trackIndexToVisibleIndex(annotation.trackIndex ?? 0)
            if (vIndex < 0) return null // 隐藏的轨道不渲染
            const top = 2 + vIndex * laneHeight
            const locked = tracks ? !!tracks[annotation.trackIndex ?? 0]?.locked : false
            return (
              <div
                key={annotation.id}
                className={`absolute bg-blue-500 bg-opacity-70 border border-blue-400 rounded group ${selectedTool==='pointer' && !locked ? 'cursor-move' : 'cursor-default'}`}
                style={{ left: `${left}%`, width: `${width}%`, top, height: laneHeight - 4 }}
                title={`${annotation.label}: ${formatTime(annotation.startTime)} - ${formatTime(annotation.endTime!)}`}
                onMouseDown={(e) => {
                  if (selectedTool !== 'pointer') return
                  if (locked) return
                  e.stopPropagation()
                  const mouseTime = pixelToTime(e.clientX)
                  const len = (annotation.endTime ?? annotation.startTime) - annotation.startTime
                  setActiveSegDrag({
                    id: annotation.id,
                    type: 'move',
                    initialStart: annotation.startTime,
                    initialEnd: annotation.endTime ?? annotation.startTime,
                    length: Math.max(len, 0),
                    offset: mouseTime - annotation.startTime,
                  })
                }}
              >
                <div className="text-xs p-1 truncate text-white font-medium">
                  {annotation.label}
                </div>
                {/* 左右拉伸手柄 */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 bg-blue-300/60 hover:bg-blue-200 ${selectedTool==='pointer' && !locked ? 'cursor-ew-resize' : 'cursor-default'}`}
                  onMouseDown={(e) => {
                    if (selectedTool !== 'pointer') return
                    if (locked) return
                    e.stopPropagation()
                    setActiveSegDrag({
                      id: annotation.id,
                      type: 'resize-start',
                      initialStart: annotation.startTime,
                      initialEnd: annotation.endTime ?? annotation.startTime,
                      length: (annotation.endTime ?? annotation.startTime) - annotation.startTime,
                    })
                  }}
                />
                <div
                  className={`absolute right-0 top-0 bottom-0 w-1.5 bg-blue-300/60 hover:bg-blue-200 ${selectedTool==='pointer' && !locked ? 'cursor-ew-resize' : 'cursor-default'}`}
                  onMouseDown={(e) => {
                    if (selectedTool !== 'pointer') return
                    if (locked) return
                    e.stopPropagation()
                    setActiveSegDrag({
                      id: annotation.id,
                      type: 'resize-end',
                      initialStart: annotation.startTime,
                      initialEnd: annotation.endTime ?? annotation.startTime,
                      length: (annotation.endTime ?? annotation.startTime) - annotation.startTime,
                    })
                  }}
                />
                {/* 删除按钮 */}
                <button
                  className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!locked) onAnnotationDelete(annotation.id)
                  }}
                  disabled={locked}
                >
                  ×
                </button>
              </div>
            )
          } else {
            const left = (annotation.startTime / duration) * 100
            const vIndex = trackIndexToVisibleIndex(annotation.trackIndex ?? 0)
            if (vIndex < 0) return null
            const top = vIndex * laneHeight
            return (
              <div
                key={annotation.id}
                className="absolute w-1 bg-yellow-500 cursor-pointer hover:bg-yellow-400 group"
                style={{ left: `${left}%`, top, height: laneHeight }}
                title={`${annotation.label}: ${formatTime(annotation.startTime)}`}
              >
                <div className="absolute -top-6 -left-4 w-8 h-6 bg-yellow-500 rounded text-xs flex items-center justify-center text-black font-bold">
                  T
                </div>
                {/* 删除按钮 */}
                <button
                  className="absolute -top-8 -left-2 w-4 h-4 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAnnotationDelete(annotation.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          }
        })}

        {/* 拖拽预览 */}
        {isDragging && dragStart !== null && dragEnd !== null && (
          <div
            className="absolute bg-green-500 bg-opacity-50 border border-green-400 rounded"
            style={{
              left: `${(Math.min(dragStart, dragEnd) / duration) * 100}%`,
              width: `${(Math.abs(dragEnd - dragStart) / duration) * 100}%`,
              top: 2 + (pendingAnnotation?.trackIndex ?? 0) * laneHeight,
              height: laneHeight - 4
            }}
          />
        )}
      </div>

      {/* 标签选择对话框 */}
      {showLabelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">
              选择标签
            </h3>
            <div className="space-y-3">
              <Select value={selectedDialogLabel} onValueChange={(v) => setSelectedDialogLabel(v)}>
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="选择标签" />
                </SelectTrigger>
                <SelectContent>
                  {groupLabels(availableLabels).map((group) => (
                    <SelectGroup key={group.name}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end">
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  disabled={!selectedDialogLabel}
                  onClick={() => handleLabelSelect(selectedDialogLabel)}
                >
                  确定
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                onClick={() => {
                  setShowLabelDialog(false)
                  setPendingAnnotation(null)
                  setSelectedDialogLabel('')
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function groupLabels(labels: string[]): { name: string; options: string[] }[] {
  const map = new Map<string, string[]>()
  for (const label of labels && labels.length ? labels : ['动作', '对话', '场景切换', '特效', '音乐', '其他']) {
    const parts = label.split('/')
    const group = parts[0]
    const arr = map.get(group) ?? []
    arr.push(label)
    map.set(group, arr)
  }
  return Array.from(map.entries()).map(([name, options]) => ({ name, options }))
}