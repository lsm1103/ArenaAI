'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen } from 'lucide-react'

interface VideoFile {
  name: string
  path: string
  thumbnail?: string
}

interface FolderSelectDialogProps {
  open: boolean
  onFolderSelect: (folderPath: string, videos?: VideoFile[]) => void
  onClose: () => void
}

export function FolderSelectDialog({ open, onFolderSelect, onClose }: FolderSelectDialogProps) {
  const [folderPath, setFolderPath] = useState('')

  const handleSubmit = () => {
    if (folderPath.trim()) {
      onFolderSelect(folderPath.trim())
    }
  }

  const handleFileSelect = async () => {
    try {
      // 使用 File System Access API 选择文件夹
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker()
        const folderName = dirHandle.name
        setFolderPath(folderName)
        
        // 读取文件夹中的视频文件
        const videoFiles: VideoFile[] = []
        const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v']
        
        for await (const [name, handle] of dirHandle.entries()) {
          if (handle.kind === 'file') {
            const extension = name.toLowerCase().substring(name.lastIndexOf('.'))
            if (videoExtensions.includes(extension)) {
              const file = await handle.getFile()
              videoFiles.push({
                name: name.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
                path: URL.createObjectURL(file), // 创建对象URL
                thumbnail: undefined
              })
            }
          }
        }
        
        if (videoFiles.length > 0) {
          // 立即触发选择，传递视频文件
          onFolderSelect(folderName, videoFiles)
        } else {
          alert('所选文件夹中没有找到视频文件')
        }
      } else {
        // 降级处理：使用文件选择器
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = 'video/*'
        
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files
          if (files && files.length > 0) {
            // 创建VideoFile对象数组
            const videoFiles: VideoFile[] = Array.from(files).map((file) => ({
              name: file.name.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
              path: URL.createObjectURL(file), // 创建对象URL
              thumbnail: undefined
            }))
            
            setFolderPath(`已选择 ${files.length} 个视频文件`)
            onFolderSelect('selected_files', videoFiles)
          }
        }
        
        input.click()
      }
    } catch (error) {
      console.log('用户取消了文件夹选择')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择视频文件夹</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-path">文件夹路径</Label>
            <div className="flex space-x-2">
              <Input
                id="folder-path"
                placeholder="请输入文件夹绝对路径，或点击右侧按钮选择文件夹"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleFileSelect}
                title="选择文件夹"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={!folderPath.trim()}>
              确定
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}