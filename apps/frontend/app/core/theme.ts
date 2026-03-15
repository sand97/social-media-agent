import type { ConfigProviderProps } from 'antd'

export const antdProviderProps: ConfigProviderProps = {
  theme: {
    token: {
      // Seed Token - WhatsApp Green
      colorPrimary: '#24d366',
      borderRadius: 16,

      colorLink: '#24d366',
      // Alias Token
      colorBgContainer: '#ffffff',

      // Typography
      fontFamily:
        "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Geist', ui-sans-serif, system-ui, sans-serif",

      // Colors from Figma design
      colorText: '#111b21',
      colorTextSecondary: '#494949',
      colorBgLayout: 'transparent',
    },
    components: {
      Modal: {
        borderRadiusLG: 26,
        wireframe: true,
      },
      Button: {
        borderRadius: 16,
        controlHeight: 46,
        paddingInline: 24,
      },
      Input: {
        borderRadius: 16,
        controlHeight: 52,
        paddingInline: 24,
      },
      Select: {
        borderRadius: 16,
        controlHeight: 52,
      },
      DatePicker: {
        borderRadius: 16,
        controlHeight: 52,
      },
      Card: {
        borderRadiusLG: 20,
        boxShadowTertiary: '0px 0px 1px 0px rgba(0,0,0,0.4)',
      },
    },
  },
}

// CSS Variables for design tokens
export const cssVariables = {
  '--background': '#fdfdfd',
  '--paper': '#ffffff',
  '--primary': '#24d366',
  '--text-primary': '#111b21',
  '--text-secondary': '#494949',
  '--colors-orange': '#ff9500',
  '--colors-purple': '#af52de',
}
