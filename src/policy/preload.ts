// src/policy/preload.ts
console.log('Preload script starting from policy folder...');

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // 버전 정보 표시
    const replaceText = (selector: string, text: string) => {
        const element = document.getElementById(selector);
        if (element) element.innerText = text;
    };

    for (const dependency of ['chrome', 'node', 'electron']) {
        const version = process.versions[dependency];
        if (version) {
            replaceText(`${dependency}-version`, version);
        }
    }
});

// Electron과 창 컨텐츠 간의 통신을 처리
const { ipcRenderer } = require('electron');

// IPC 이벤트 리스너 등록
ipcRenderer.on('find-in-page', () => {
    console.log('찾기 기능 실행');
});

ipcRenderer.on('find-next', () => {
    console.log('다음 찾기 실행');
});

ipcRenderer.on('find-previous', () => {
    console.log('이전 찾기 실행');
});

ipcRenderer.on('find-replace', () => {
    console.log('찾기 & 바꾸기 실행');
});
