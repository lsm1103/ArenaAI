'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  availableLabels: string[]
  onLabelsChange: (labels: string[]) => void
}

export function SettingsDialog({ open, onClose, availableLabels, onLabelsChange }: SettingsDialogProps) {
  const [newLabel, setNewLabel] = useState('')

  const addLabel = () => {
    if (newLabel.trim() && !availableLabels.includes(newLabel.trim())) {
      onLabelsChange([...availableLabels, newLabel.trim()])
      setNewLabel('')
    }
  }

  const removeLabel = (labelToRemove: string) => {
    onLabelsChange(availableLabels.filter(label => label !== labelToRemove))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>标注设置</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 标签配置 */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">可选标签配置</Label>
              <p className="text-sm text-gray-600 mt-1">
                配置在标注过程中可以选择的标签选项
              </p>
            </div>

            {/* 当前标签列表 */}
            <div className="space-y-2">
              <Label className="text-sm">当前标签：</Label>
              <div className="flex flex-wrap gap-2 min-h-10 p-2 border rounded-md bg-gray-50">
                {availableLabels.length > 0 ? (
                  availableLabels.map((label, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                      <span>{label}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-auto p-0 ml-1"
                        onClick={() => removeLabel(label)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))
                ) : (
                  <span className="text-gray-500 text-sm">暂无标签</span>
                )}
              </div>
            </div>

            {/* 添加新标签 */}
            <div className="flex space-x-2">
              <Input
                placeholder="输入新标签名称"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addLabel()}
                className="flex-1"
              />
              <Button onClick={addLabel} disabled={!newLabel.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </div>
          </div>

          {/* 其他设置可以在这里添加 */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">其他设置</Label>
              <p className="text-sm text-gray-600 mt-1">
                更多配置选项
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                • 支持多层级标签结构
              </p>
              <p className="text-sm text-gray-600">
                • 支持自定义标签颜色
              </p>
              <p className="text-sm text-gray-600">
                • 支持标签分组管理
              </p>
              <p className="text-sm text-gray-500 mt-2">
                更多功能正在开发中...
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onClose}>
            保存设置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}