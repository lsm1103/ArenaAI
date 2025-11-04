'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Settings, SkipForward, CheckCircle, Home, Eye } from 'lucide-react'

interface TopActionsProps {
  onSkip: (reason: string) => void
  onComplete: () => void
  onSettings: () => void
  onReset: () => void
  // 可选：列表显示切换（用于在列表隐藏时提供恢复入口）
  isListVisible?: boolean
  onToggleList?: () => void
}

export function TopActions({ onSkip, onComplete, onSettings, onReset, isListVisible, onToggleList }: TopActionsProps) {
  const [showSkipDialog, setShowSkipDialog] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  const handleSkip = () => {
    if (skipReason.trim()) {
      onSkip(skipReason.trim())
      setSkipReason('')
      setShowSkipDialog(false)
    }
  }

  return (
    <>
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-semibold text-gray-900">视频标注系统</h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* 当列表隐藏时显示“显示列表”按钮 */}
          {onToggleList && isListVisible === false && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleList}
              className="flex items-center space-x-1"
            >
              <Eye className="w-4 h-4" />
              {/* <span>显示列表</span> */}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex items-center space-x-1"
          >
            <Home className="w-4 h-4" />
            <span>返回</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSkipDialog(true)}
            className="flex items-center space-x-1"
          >
            <SkipForward className="w-4 h-4" />
            <span>跳过</span>
          </Button>

          <Button
            size="sm"
            onClick={onComplete}
            className="flex items-center space-x-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4" />
            <span>完成</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onSettings}
            className="flex items-center space-x-1"
          >
            <Settings className="w-4 h-4" />
            <span>设置</span>
          </Button>
        </div>
      </div>

      {/* 跳过原因弹窗 */}
      <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>跳过标注</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                请说明跳过原因：
              </label>
              <Textarea
                placeholder="请输入跳过此次标注的原因..."
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                className="min-h-20"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSkipDialog(false)
                  setSkipReason('')
                }}
              >
                取消
              </Button>
              <Button
                onClick={handleSkip}
                disabled={!skipReason.trim()}
              >
                确认跳过
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}