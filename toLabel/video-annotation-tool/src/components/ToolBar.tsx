'use client'

import { MousePointer2, Minus, MapPin, PlusSquare } from 'lucide-react'

interface ToolBarProps {
  selectedTool: 'pointer' | 'segment' | 'timestamp'
  onToolSelect: (tool: 'pointer' | 'segment' | 'timestamp') => void
  compact?: boolean
  onAddTrack?: () => void
}

export function ToolBar({ selectedTool, onToolSelect, compact = false, onAddTrack }: ToolBarProps) {
  const tools = [
    {
      id: 'pointer' as const,
      name: '选择工具',
      icon: MousePointer2,
      description: '默认鼠标工具，用于选择和移动时间轴'
    },
    {
      id: 'segment' as const,
      name: '时间段标注',
      icon: Minus,
      description: '拖拽选择时间范围进行标注'
    },
    {
      id: 'timestamp' as const,
      name: '时间戳标注',
      icon: MapPin,
      description: '点击添加时间戳标注，支持 Ctrl+D 快捷键'
    }
  ]

  return (
    <div className={`bg-gray-800 border-b border-gray-600 ${compact ? 'p-1' : 'p-2'}`}>
      <div className="flex items-center space-x-1">
        {tools.map((tool) => {
          const Icon = tool.icon
          const isSelected = selectedTool === tool.id
          
          return (
            <button
              key={tool.id}
              className={`
                flex items-center justify-center rounded transition-colors
                ${compact ? 'w-8 h-8' : 'w-10 h-10'}
                ${isSelected 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }
              `}
              onClick={() => onToolSelect(tool.id)}
              title={`${tool.name} - ${tool.description}`}
            >
              <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
          )
        })}
        
        <button
          className={`
            flex items-center justify-center rounded transition-colors ml-2
            ${compact ? 'w-8 h-8' : 'w-10 h-10'}
            bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white
          `}
          onClick={() => onAddTrack?.()}
          title={"增加视频轨道"}
        >
          <PlusSquare className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        
        {/* 工具说明 */}
        <div className={`ml-3 ${compact ? 'text-xs' : 'text-sm'} text-gray-400`}>
          {selectedTool === 'pointer' && '选择工具：点击时间轴跳转播放位置'}
          {selectedTool === 'segment' && '时间段工具：拖拽选择时间范围'}
          {selectedTool === 'timestamp' && '时间戳工具：点击添加标记点，或按 Ctrl+D'}
        </div>
      </div>
    </div>
  )
}