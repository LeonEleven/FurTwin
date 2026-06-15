export {}

declare global {
  interface Window {
    petAPI: {
      dragStart: (payload: { screenX: number; screenY: number }) => void
      dragMove: (payload: { screenX: number; screenY: number }) => void
      dragEnd: () => void
      showContextMenu: () => void
      onMenuAction: (callback: (action: string) => void) => () => void
      resizeWindow: (width: number, height: number) => void
    }
  }
}
