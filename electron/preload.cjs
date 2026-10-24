'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const inv = (ch) => (arg) => ipcRenderer.invoke(ch, arg)

contextBridge.exposeInMainWorld('desk', {
  request: inv('http:request'),
  download: inv('http:download'),
  uploadForm: inv('http:uploadForm'),
  pickFiles: inv('file:pick'),
  blob: inv('http:blob'),
  scanId: inv('ai:scanId'),
  aiChat: inv('ai:chat'),
  aiDocs: inv('ai:docs'),
  aiCompare: inv('ai:compare'),
  openExternal: inv('file:openExternal'),
  ping: inv('http:ping'),
  getConfig: inv('cfg:get'),
  setConfig: inv('cfg:set'),
  info: inv('app:info'),
  toggleFullscreen: inv('app:toggleFullscreen'),
  saveFile: inv('file:save'),
  openText: inv('file:openText'),
})
