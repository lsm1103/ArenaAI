'use client'

import { ToolBar } from './ToolBar'
import { VideoTimeline } from './VideoTimeline'
import { TimelineAnnotation } from './AnnotationInterface'
import { useState } from 'react'

interface TimelineEditorProps {
  duration: number
  currentTime: number
  annotations: TimelineAnnotation[]
  onTimeChange: (time: number) => void
  onAnnotationAdd: (annotation: Omit<TimelineAnnotation, 'id'>) => void
  onAnnotationUpdate: (id: string, annotation: Partial<TimelineAnnotation>) => void
  onAnnotationDelete: (id: string) => void
  selectedTool: 'pointer' | 'segment' | 'timestamp'
  onToolSelect: (tool: 'pointer' | 'segment' | 'timestamp') => void
  availableLabels: string[]
}

export function TimelineEditor({
  duration,
  currentTime,
  annotations,
  onTimeChange,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  selectedTool,
  onToolSelect,
  availableLabels,
}: TimelineEditorProps) {
  const [trackCount, setTrackCount] = useState(1)

  const handleAddTrack = () => {
    setTrackCount((c) => c + 1)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 紧凑型工具栏，不可拖拽 */}
      <ToolBar selectedTool={selectedTool} onToolSelect={onToolSelect} compact onAddTrack={handleAddTrack} />

      {/* 时间轴铺满剩余空间（允许 tooltip 溢出以盖过工具栏）*/}
      <div className="flex-1 min-h-0 bg-gray-900 overflow-visible">
        <VideoTimeline
          duration={duration}
          currentTime={currentTime}
          annotations={annotations}
          onTimeChange={onTimeChange}
          onAnnotationAdd={onAnnotationAdd}
          onAnnotationUpdate={onAnnotationUpdate}
          onAnnotationDelete={onAnnotationDelete}
          selectedTool={selectedTool}
          trackCount={trackCount}
          availableLabels={availableLabels}
        />
      </div>
    </div>
  )
}