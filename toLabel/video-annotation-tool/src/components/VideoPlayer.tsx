'use client'

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'

interface VideoPlayerProps {
  videoPath: string
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
}

export interface VideoPlayerRef {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (time: number) => void
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ videoPath, onTimeUpdate, onDurationChange }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => videoRef.current?.currentTime || 0,
      getDuration: () => videoRef.current?.duration || 0,
      seekTo: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time
        }
      }
    }))

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.load()
      }
    }, [videoPath])

    useEffect(() => {
      const video = videoRef.current
      if (!video) return

      const handleTimeUpdate = () => {
        onTimeUpdate?.(video.currentTime)
      }

      const handleLoadedMetadata = () => {
        onDurationChange?.(video.duration)
      }

      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('loadedmetadata', handleLoadedMetadata)

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      }
    }, [onTimeUpdate, onDurationChange])

    // 检查是否是blob URL（用户选择的文件）
    const isBlobUrl = videoPath.startsWith('blob:')

  // 当前页面 origin，用于校验 blob 是否同源
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const isSameOriginBlob = isBlobUrl && videoPath.startsWith(`blob:${currentOrigin}`)

  return (
    <div className="w-full h-full flex items-center justify-center">
      {isSameOriginBlob ? (
        // 显示实际的视频播放器
        <video
          ref={videoRef}
          className="w-full h-full bg-black object-contain"
          controls
          preload="metadata"
        >
          <source src={videoPath} type="video/mp4" />
          您的浏览器不支持视频播放。
        </video>
      ) : (
        // 显示占位符（用于文件路径）
        <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
          <div className="text-center text-white">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-lg font-medium">视频播放器</p>
            <p className="text-sm text-gray-400 mt-1">
              {videoPath.split('/').pop()}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              请选择视频文件以播放
            </p>
            {isBlobUrl && !isSameOriginBlob && (
              <p className="text-xs text-red-300 mt-1">
                当前会话端口与视频源不一致，返回重新选择文件。
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'