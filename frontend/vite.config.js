import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  define: {
    // Environment variables that will be available in the frontend
    __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL || 'https://multi-wallet-manager.onrender.com/api'),
    __VITE_CONTRACT_ADDRESS__: JSON.stringify(process.env.VITE_CONTRACT_ADDRESS || '0x88e199AeBB58Eb75F6C2DC9fBe73F871eCC8C92F'),
    __VITE_USDT_CONTRACT_ADDRESS__: JSON.stringify(process.env.VITE_USDT_CONTRACT_ADDRESS || '0x2f79e9e36c0d293f3c88F4aF05ABCe224c0A5638'),
    __VITE_CHAIN_ID__: JSON.stringify(process.env.VITE_CHAIN_ID || '97'),
    __VITE_CHAIN_NAME__: JSON.stringify(process.env.VITE_CHAIN_NAME || 'BSC Testnet'),
    __VITE_RPC_URL__: JSON.stringify(process.env.VITE_RPC_URL || 'https://bsc-testnet.publicnode.com')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})

