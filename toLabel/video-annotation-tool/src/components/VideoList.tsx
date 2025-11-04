'use client'

import { useState, useEffect } from 'react'
import { VideoFile } from './AnnotationInterface'
import { generateVideoThumbnailFromUrl } from '../lib/videoUtils'

interface VideoListProps {
  videos: VideoFile[]
  currentVideo: VideoFile | null
  onVideoSelect: (video: VideoFile) => void
}

interface VideoThumbnail {
  [videoPath: string]: string
}

export function VideoList({ videos, currentVideo, onVideoSelect }: VideoListProps) {
  const [thumbnails, setThumbnails] = useState<VideoThumbnail>({})
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set())

  // 生成视频缩略图
  const generateThumbnail = async (video: VideoFile) => {
    if (thumbnails[video.path] || loadingThumbnails.has(video.path)) {
      return
    }

    setLoadingThumbnails(prev => new Set(prev).add(video.path))

    try {
      const thumbnailUrl = await generateVideoThumbnailFromUrl(video.path, 1)
      setThumbnails(prev => ({
        ...prev,
        [video.path]: thumbnailUrl
      }))
    } catch (error) {
      console.error('生成缩略图失败:', error)
    } finally {
      setLoadingThumbnails(prev => {
        const newSet = new Set(prev)
        newSet.delete(video.path)
        return newSet
      })
    }
  }

  // 当视频列表变化时，生成缩略图
  useEffect(() => {
    videos.forEach(video => {
      generateThumbnail(video)
    })
  }, [videos])

  return (
    <div className="space-y-1 p-2">
      {videos.map((video, index) => (
        <div
          key={video.path}
          className={`p-3 rounded-lg cursor-pointer transition-colors ${
            currentVideo?.path === video.path
              ? 'bg-red-100 border border-red-300'
              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
          }`}
          onClick={() => onVideoSelect(video)}
        >
          <div className="space-y-2">
            {/* 缩略图 */}
            <div className="w-full h-20 bg-gray-200 rounded flex items-center justify-center overflow-hidden">
              {loadingThumbnails.has(video.path) ? (
                <span className="text-xs text-gray-500">加载中...</span>
              ) : thumbnails[video.path] ? (
                <img
                  src={thumbnails[video.path]}
                  alt={video.name}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <span className="text-xs text-gray-500">缩略图</span>
              )}
            </div>
            {/* 视频名称 */}
            <p className="text-sm font-medium text-gray-900 truncate">
              {video.name}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}