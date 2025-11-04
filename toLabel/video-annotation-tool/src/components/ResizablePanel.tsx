'use client'

import { useState, useRef, useEffect, ReactNode, Fragment, useMemo } from 'react'

interface ResizablePanelProps {
  children: ReactNode
  direction: 'horizontal' | 'vertical'
  initialSizes?: number[]
  minSizes?: number[]
  className?: string
  showDividers?: boolean
  gutterSize?: number // 可交互命中区域（像素）
  handleThickness?: number // 视觉细线厚度（像素）
  enableDoubleClickReset?: boolean // 双击重置相邻两面板比例
  disabledDividerIndices?: number[] // 禁用指定分隔条索引（0 表示第一个分隔条）
}

export function ResizablePanel({ 
  children, 
  direction, 
  initialSizes = [50, 50], 
  minSizes = [20, 20],
  className = '',
  showDividers = true,
  gutterSize = 12,
  handleThickness = 2,
  enableDoubleClickReset = true,
  disabledDividerIndices = [],
}: ResizablePanelProps) {
  const [sizes, setSizes] = useState(initialSizes)
  const [isDragging, setIsDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const startPos = useRef(0)
  const startSizes = useRef<number[]>([])
  const initialSizesRef = useRef<number[]>(initialSizes)
  const isDraggingRef = useRef(false)

  // 过滤掉条件渲染产生的无效子节点（如 false、null、undefined）
  const rawChildren = Array.isArray(children) ? children : [children]
  const panels = rawChildren.filter(Boolean) as ReactNode[]
  const disabledSet = useMemo(() => new Set(disabledDividerIndices), [disabledDividerIndices])

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragIndex(index)
    isDraggingRef.current = true
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSizes.current = [...sizes]

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const containerSize = direction === 'horizontal' ? rect.width : rect.height
      const currentPos = direction === 'horizontal' ? ev.clientX : ev.clientY
      const delta = currentPos - startPos.current
      const deltaPercent = (delta / containerSize) * 100

      const newSizes = [...startSizes.current]
      const leftMin = minSizes[index] ?? 5
      const rightMin = minSizes[index + 1] ?? 5

      // 以拖拽开始时的两侧面板之和为恒定总量，避免总比例累加造成布局溢出
      const startLeft = startSizes.current[index] ?? (100 / panels.length)
      const startRight = startSizes.current[index + 1] ?? (100 / panels.length)
      const pairTotal = startLeft + startRight
      const desiredLeft = startLeft + deltaPercent
      const leftMax = pairTotal - rightMin
      const clampedLeft = Math.min(Math.max(desiredLeft, leftMin), leftMax)
      const clampedRight = pairTotal - clampedLeft

      newSizes[index] = clampedLeft
      newSizes[index + 1] = clampedRight
      setSizes(newSizes)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      setDragIndex(-1)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // 移除旧的基于组件作用域的全局 mousemove/mouseup 处理，改为在 mousedown 中绑定/解绑闭包函数

  // 触摸支持：在 touchstart 内绑定闭包处理器，避免状态闭包问题
  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    setIsDragging(true)
    setDragIndex(index)
    isDraggingRef.current = true
    const touch = e.touches[0]
    startPos.current = direction === 'horizontal' ? touch.clientX : touch.clientY
    startSizes.current = [...sizes]

    const onTouchMove = (ev: TouchEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      if (ev.touches.length === 0) return
      const t = ev.touches[0]
      const rect = containerRef.current.getBoundingClientRect()
      const containerSize = direction === 'horizontal' ? rect.width : rect.height
      const currentPos = direction === 'horizontal' ? t.clientX : t.clientY
      const delta = currentPos - startPos.current
      const deltaPercent = (delta / containerSize) * 100

      const newSizes = [...startSizes.current]
      const leftMin = minSizes[index] ?? 5
      const rightMin = minSizes[index + 1] ?? 5

      // 与鼠标拖拽一致，保持相邻两面板总量恒定
      const startLeft = startSizes.current[index] ?? (100 / panels.length)
      const startRight = startSizes.current[index + 1] ?? (100 / panels.length)
      const pairTotal = startLeft + startRight
      const desiredLeft = startLeft + deltaPercent
      const leftMax = pairTotal - rightMin
      const clampedLeft = Math.min(Math.max(desiredLeft, leftMin), leftMax)
      const clampedRight = pairTotal - clampedLeft

      newSizes[index] = clampedLeft
      newSizes[index + 1] = clampedRight
      setSizes(newSizes)
      ev.preventDefault()
    }

    const onTouchEnd = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      setDragIndex(-1)
      document.removeEventListener('touchmove', onTouchMove as any)
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove as any, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  // 双击重置相邻两面板到初始比例（保持两者总量不变）
  const handleDoubleClick = (index: number) => {
    if (!enableDoubleClickReset) return
    const newSizes = [...sizes]
    const pairTotal = newSizes[index] + newSizes[index + 1]
    const refA = initialSizesRef.current[index] ?? (100 / panels.length)
    const refB = initialSizesRef.current[index + 1] ?? (100 / panels.length)
    const refTotal = refA + refB || 1
    newSizes[index] = (refA / refTotal) * pairTotal
    newSizes[index + 1] = (refB / refTotal) * pairTotal
    setSizes(newSizes)
  }

  // 键盘微调
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    const step = 1 // 百分比步进
    const newSizes = [...sizes]
    const leftMin = minSizes[index] ?? 5
    const rightMin = minSizes[index + 1] ?? 5
    const pairTotal = newSizes[index] + newSizes[index + 1]

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      const desiredLeft = newSizes[index] - step
      const leftMax = pairTotal - rightMin
      const clampedLeft = Math.min(Math.max(desiredLeft, leftMin), leftMax)
      newSizes[index] = clampedLeft
      newSizes[index + 1] = pairTotal - clampedLeft
      setSizes(newSizes)
      e.preventDefault()
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      const desiredLeft = newSizes[index] + step
      const leftMax = pairTotal - rightMin
      const clampedLeft = Math.min(Math.max(desiredLeft, leftMin), leftMax)
      newSizes[index] = clampedLeft
      newSizes[index + 1] = pairTotal - clampedLeft
      setSizes(newSizes)
      e.preventDefault()
    }
  }

  useEffect(() => {
    return () => {
      // 清理在某些边缘情况下未被解绑的事件（无需持有闭包引用，这里主要防御性留空）
    }
  }, [])

  return (
    <div 
      ref={containerRef}
      className={`flex select-none relative overflow-hidden ${direction === 'horizontal' ? 'flex-row h-full' : 'flex-col w-full'} ${className}`}
    >
      {panels.map((child, index) => (
        <Fragment key={`panel-group-${index}`}>
          {/* 面板内容 */}
          <div
            key={`panel-${index}`}
            style={{
              [direction === 'horizontal' ? 'width' : 'height']: `${sizes[index] ?? (100 / panels.length)}%`,
              [direction === 'horizontal' ? 'height' : 'width']: '100%'
            }}
            className="overflow-hidden min-w-0 min-h-0"
          >
            {child}
          </div>
        </Fragment>
      ))}

      {/* 绝对定位的分隔覆盖层，不占据布局空间 */}
      {panels.map((_, index) => {
        if (index >= panels.length - 1) return null
        if (disabledSet.has(index)) return null

        const cumulative = sizes.slice(0, index + 1).reduce((sum, s) => sum + (s ?? (100 / panels.length)), 0)

        if (direction === 'horizontal') {
          return (
            <div
              key={`overlay-divider-${index}`}
              role="separator"
              aria-orientation="vertical"
              tabIndex={0}
              className={`group cursor-col-resize absolute top-0 z-30 touch-none`}
              style={{ left: `calc(${cumulative}% - ${gutterSize / 2}px)`, height: '100%', width: gutterSize }}
              onMouseDown={(e) => handleMouseDown(index, e)}
              onDoubleClick={() => handleDoubleClick(index)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onTouchStart={(e) => handleTouchStart(index, e)}
            >
              {showDividers && (
                <span
                  className={`absolute bg-gray-300 group-hover:bg-gray-400 ${isDragging && dragIndex === index ? 'bg-blue-500' : ''}`}
                  style={{ top: 0, bottom: 0, left: '50%', width: handleThickness, transform: 'translateX(-50%)' }}
                />
              )}
            </div>
          )
        }

        // vertical
        const cumulativeV = sizes.slice(0, index + 1).reduce((sum, s) => sum + (s ?? (100 / panels.length)), 0)
        return (
          <div
            key={`overlay-divider-${index}`}
            role="separator"
            aria-orientation="horizontal"
            tabIndex={0}
            className={`group cursor-row-resize absolute left-0 z-30 touch-none`}
            style={{ top: `calc(${cumulativeV}% - ${gutterSize / 2}px)`, width: '100%', height: gutterSize }}
            onMouseDown={(e) => handleMouseDown(index, e)}
            onDoubleClick={() => handleDoubleClick(index)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onTouchStart={(e) => handleTouchStart(index, e)}
          >
            {showDividers && (
              <span
                className={`absolute bg-gray-300 group-hover:bg-gray-400 ${isDragging && dragIndex === index ? 'bg-blue-500' : ''}`}
                style={{ left: 0, right: 0, top: '50%', height: handleThickness, transform: 'translateY(-50%)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}