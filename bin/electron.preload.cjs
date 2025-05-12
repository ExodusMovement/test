const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('__test_print', (...args) => ipcRenderer.sendSync('print', args))
