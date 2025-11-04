'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plus, X, Edit2, Check } from 'lucide-react'
import { VideoAnnotation, TimelineAnnotation } from './AnnotationInterface'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AnnotationResultsProps {
  annotation: VideoAnnotation
  onAnnotationChange: (annotation: VideoAnnotation) => void
  onTimelineAnnotationUpdate?: (id: string, updates: Partial<TimelineAnnotation>) => void
  onTimelineAnnotationDelete?: (id: string) => void
  availableLabels?: string[]
}

export function AnnotationResults({ 
  annotation, 
  onAnnotationChange, 
  onTimelineAnnotationUpdate,
  onTimelineAnnotationDelete,
  availableLabels = ['标签1', '标签2', '标签3']
}: AnnotationResultsProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const addLabel = () => {
    if (newLabel.trim()) {
      onAnnotationChange({
        ...annotation,
        labels: [...annotation.labels, newLabel.trim()]
      })
      setNewLabel('')
    }
  }

  const removeLabel = (index: number) => {
    onAnnotationChange({
      ...annotation,
      labels: annotation.labels.filter((_, i) => i !== index)
    })
  }

  const addDescription = () => {
    if (newDescription.trim()) {
      onAnnotationChange({
        ...annotation,
        descriptions: [...annotation.descriptions, newDescription.trim()]
      })
      setNewDescription('')
    }
  }

  const removeDescription = (index: number) => {
    onAnnotationChange({
      ...annotation,
      descriptions: annotation.descriptions.filter((_, i) => i !== index)
    })
  }

  const startEditAnnotation = (item: TimelineAnnotation) => {
    setEditingAnnotation(item.id)
    setEditLabel(item.label)
    setEditDescription(item.description || '')
  }

  const saveEditAnnotation = (id: string) => {
    if (onTimelineAnnotationUpdate) {
      onTimelineAnnotationUpdate(id, {
        label: editLabel,
        description: editDescription
      })
    }
    setEditingAnnotation(null)
    setEditLabel('')
    setEditDescription('')
  }

  const cancelEditAnnotation = () => {
    setEditingAnnotation(null)
    setEditLabel('')
    setEditDescription('')
  }

  const deleteTimelineAnnotation = (id: string) => {
    if (onTimelineAnnotationDelete) {
      onTimelineAnnotationDelete(id)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-3 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-sm font-medium text-gray-900">标注结果</h3>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="segments" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mx-3 mt-3 flex-shrink-0">
            <TabsTrigger value="segments" className="text-xs px-2 py-1">片段</TabsTrigger>
            <TabsTrigger value="timestamps" className="text-xs px-2 py-1">时间戳</TabsTrigger>
            <TabsTrigger value="labels" className="text-xs px-2 py-1">标签</TabsTrigger>
            <TabsTrigger value="descriptions" className="text-xs px-2 py-1">描述</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-3">
            <TabsContent value="segments" className="mt-0 space-y-2 h-full">
              <h4 className="text-sm font-medium mb-2 text-gray-700">时间段标注</h4>
              <div className="space-y-2">
                {annotation.timeline
                  .filter(item => item.type === 'segment')
                  .map(item => (
                    <div key={item.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs">
                      {editingAnnotation === item.id ? (
                        <div className="space-y-2">
                          <Select value={editLabel} onValueChange={(v) => setEditLabel(v)}>
                            <SelectTrigger className="h-8 text-xs w-full">
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
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="text-xs min-h-16 resize-none"
                            placeholder="描述"
                          />
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={() => saveEditAnnotation(item.id)} className="h-7 px-2">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditAnnotation} className="h-7 px-2">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-blue-800">{item.label}</div>
                            <div className="flex space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-blue-100"
                                onClick={() => startEditAnnotation(item)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-red-100 text-red-600"
                                onClick={() => deleteTimelineAnnotation(item.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="text-blue-600 font-mono text-xs mb-1">
                            {formatTime(item.startTime)} - {formatTime(item.endTime || item.startTime)}
                          </div>
                          {item.description && (
                            <div className="text-gray-600 text-xs leading-relaxed">{item.description}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                {annotation.timeline.filter(item => item.type === 'segment').length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">暂无片段标注</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="timestamps" className="mt-0 space-y-2 h-full">
              <h4 className="text-sm font-medium mb-2 text-gray-700">时间戳标注</h4>
              <div className="space-y-2">
                {annotation.timeline
                  .filter(item => item.type === 'timestamp')
                  .map(item => (
                    <div key={item.id} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-xs">
                      {editingAnnotation === item.id ? (
                        <div className="space-y-2">
                          <Select value={editLabel} onValueChange={(v) => setEditLabel(v)}>
                            <SelectTrigger className="h-8 text-xs w-full">
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
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="text-xs min-h-16 resize-none"
                            placeholder="描述"
                          />
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={() => saveEditAnnotation(item.id)} className="h-7 px-2">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditAnnotation} className="h-7 px-2">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-yellow-800">{item.label}</div>
                            <div className="flex space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-yellow-100"
                                onClick={() => startEditAnnotation(item)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-red-100 text-red-600"
                                onClick={() => deleteTimelineAnnotation(item.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="text-yellow-600 font-mono text-xs mb-1">{formatTime(item.startTime)}</div>
                          {item.description && (
                            <div className="text-gray-600 text-xs leading-relaxed">{item.description}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                {annotation.timeline.filter(item => item.type === 'timestamp').length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">暂无时间戳标注</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="labels" className="mt-0 space-y-3 h-full">
              <h4 className="text-sm font-medium mb-2 text-gray-700">视频标签</h4>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {annotation.labels.map((label, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {label}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 h-4 w-4 p-0 hover:bg-red-100"
                        onClick={() => removeLabel(index)}
                      >
                        <X className="w-2 h-2" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <div className="flex space-x-2 items-center">
                  <div className="flex-1">
                    <Select value={newLabel} onValueChange={(v) => setNewLabel(v)}>
                      <SelectTrigger className="h-8 text-xs w-full">
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
                  </div>
                  <Button size="sm" onClick={addLabel} className="h-8 px-3" disabled={!newLabel}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="descriptions" className="mt-0 space-y-3 h-full">
              <h4 className="text-sm font-medium mb-2 text-gray-700">视频描述</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  {annotation.descriptions.map((description, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg border text-xs">
                      <div className="flex justify-between items-start">
                        <p className="text-gray-700 leading-relaxed flex-1">{description}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2 h-6 w-6 p-0 hover:bg-red-100 text-red-600"
                          onClick={() => removeDescription(index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="添加新描述"
                    className="text-xs min-h-20 resize-none"
                  />
                  <Button size="sm" onClick={addDescription} className="h-8 px-3">
                    <Plus className="w-3 h-3 mr-1" />
                    添加描述
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

function groupLabels(labels: string[]): { name: string; options: string[] }[] {
  const map = new Map<string, string[]>()
  for (const label of labels && labels.length ? labels : ['标签1', '标签2', '标签3']) {
    const parts = label.split('/')
    const group = parts[0]
    const arr = map.get(group) ?? []
    arr.push(label)
    map.set(group, arr)
  }
  return Array.from(map.entries()).map(([name, options]) => ({ name, options }))
}