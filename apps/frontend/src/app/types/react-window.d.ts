declare module 'react-window' {
  import { Component, CSSProperties, ReactNode } from 'react'

  export interface ListChildComponentProps {
    index: number
    style: CSSProperties
  }

  export interface FixedSizeListProps {
    children:
      | Component<ListChildComponentProps>
      | ((props: ListChildComponentProps) => ReactNode)
    className?: string
    height: number | string
    itemCount: number
    itemSize: number
    width: number | string
    initialScrollOffset?: number
    onScroll?: (props: {
      scrollDirection: 'forward' | 'backward'
      scrollOffset: number
      scrollUpdateWasRequested: boolean
    }) => void
  }

  export class FixedSizeList extends Component<FixedSizeListProps> {}
}
