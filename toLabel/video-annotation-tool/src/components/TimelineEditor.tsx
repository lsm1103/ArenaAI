'use client'

import { ToolBar } from './ToolBar'
import { VideoTimeline } from './VideoTimeline'
import { TimelineAnnotation } from './AnnotationInterface'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Lock, Unlock, Eye, EyeOff, Trash2, Edit2, Check, X } from 'lucide-react'

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
  const [tracks, setTracks] = useState<Array<{ id: string; name: string; locked: boolean; hidden: boolean }>>([
    { id: 't-1', name: '轨道 1', locked: false, hidden: false },
  ])
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleAddTrack = () => {
    setTracks((prev) => {
      const nextIndex = prev.length + 1
      return [...prev, { id: `t-${nextIndex}`, name: `轨道 ${nextIndex}`, locked: false, hidden: false }]
    })
  }

  const toggleLock = (index: number) => {
    setTracks((prev) => prev.map((t, i) => i === index ? { ...t, locked: !t.locked } : t))
  }

  const toggleHide = (index: number) => {
    setTracks((prev) => prev.map((t, i) => i === index ? { ...t, hidden: !t.hidden } : t))
  }

  const deleteTrack = (index: number) => {
    setTracks((prev) => {
      if (prev.length <= 1) return prev // 保底至少保留一条轨道
      const next = prev.filter((_, i) => i !== index)
      // 重新调整受影响标注的 trackIndex：当前轨道上的标注移至 0；后续轨道整体前移
      annotations.forEach((ann) => {
        const ti = ann.trackIndex ?? 0
        if (ti === index) {
          onAnnotationUpdate(ann.id, { trackIndex: 0 })
        } else if (ti > index) {
          onAnnotationUpdate(ann.id, { trackIndex: ti - 1 })
        }
      })
      return next
    })
  }

  const startEditTrackName = (index: number) => {
    setEditingTrackId(tracks[index].id)
    setEditingName(tracks[index].name)
  }

  const saveEditTrackName = (index: number) => {
    setTracks((prev) => prev.map((t, i) => i === index ? { ...t, name: editingName.trim() || t.name } : t))
    setEditingTrackId(null)
    setEditingName('')
  }

  const cancelEditTrackName = () => {
    setEditingTrackId(null)
    setEditingName('')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 紧凑型工具栏，不可拖拽 */}
      <ToolBar selectedTool={selectedTool} onToolSelect={onToolSelect} compact onAddTrack={handleAddTrack} />

      {/* 轨道头部（与时间线轨道高度一致）*/}
      <div className="bg-gray-800 border-b border-gray-700">
        {tracks.map((t, idx) => (
          <div key={t.id} className="flex items-center justify-between px-2" style={{ height: 24 }}>
            <div className="flex items-center space-x-2">
              {editingTrackId === t.id ? (
                <div className="flex items-center space-x-1">
                  <input
                    className="h-6 px-2 text-xs rounded bg-gray-700 border border-gray-600 text-white outline-none"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                  />
                  <Button size="sm" className="h-6 px-2" onClick={() => saveEditTrackName(idx)}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2" onClick={cancelEditTrackName}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-200">{t.name}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEditTrackName(idx)}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleLock(idx)} title={t.locked ? '解锁' : '锁定'}>
                {t.locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleHide(idx)} title={t.hidden ? '显示' : '隐藏'}>
                {t.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteTrack(idx)} disabled={tracks.length <= 1} title="删除轨道">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

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
          tracks={tracks}
          availableLabels={availableLabels}
        />
      </div>
    </div>
  )
}