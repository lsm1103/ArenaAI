'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FolderSelectDialog } from '@/components/FolderSelectDialog'
import { AnnotationInterface } from '@/components/AnnotationInterface'

export interface VideoFile {
  name: string
  path: string
  thumbnail?: string
}

export default function Home() {
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [selectedVideos, setSelectedVideos] = useState<VideoFile[]>([])

  const handleFolderSelect = (folderPath: string, videos?: VideoFile[]) => {
    setSelectedFolder(folderPath)
    if (videos) {
      setSelectedVideos(videos)
    }
    setShowFolderDialog(false)
  }

  const handleReset = () => {
    setSelectedFolder('')
    setSelectedVideos([])
  }

  if (selectedFolder) {
    return (
      <AnnotationInterface 
        folderPath={selectedFolder} 
        selectedVideos={selectedVideos}
        onReset={handleReset} 
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">视频标注工具</h1>
        <Button 
          onClick={() => setShowFolderDialog(true)}
          size="lg"
        >
          选择文件夹
        </Button>
      </div>

      <FolderSelectDialog
        open={showFolderDialog}
        onFolderSelect={handleFolderSelect}
        onClose={() => setShowFolderDialog(false)}
      />
    </div>
  )
}
