import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = Array.isArray(value)
    ? value.length
    : Array.isArray(defaultValue)
      ? defaultValue.length
      : 1
  return (
    <SliderPrimitive.Root
      data-slot='slider'
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center py-1.5 select-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot='slider-track'
        className='relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted'
      >
        <SliderPrimitive.Range
          data-slot='slider-range'
          className='absolute h-full bg-primary'
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot='slider-thumb'
          key={index}
          className='block size-4 shrink-0 cursor-pointer rounded-full border-2 border-primary bg-background shadow-sm ring-ring/40 transition-[box-shadow] duration-150 hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none'
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
