// scripts/file-utils.js

const { ipcRenderer } = require('electron');
const path = require('path');

// 파일 경로를 폴더 구조로 그룹화하는 함수
function groupFilesByFolder(files, basePath) {
    const tree = {
        _files: [],
        _path: basePath,
    };

    files.forEach((file) => {
        try {
            // 기본 경로에 대한 상대 경로 구하기
            let relativePath = file;
            if (file.startsWith(basePath)) {
                relativePath = file.substring(basePath.length);
                if (
                    relativePath.startsWith('/') ||
                    relativePath.startsWith('\\')
                ) {
                    relativePath = relativePath.substring(1);
                }
            }

            // 경로 구분자 표준화
            const normalizedPath = relativePath.replace(/\\/g, '/');
            const parts = normalizedPath.split('/');

            // 파일 이름은 경로의 마지막 부분
            const fileName = parts.pop();

            // 현재 트리 레벨 참조
            let currentLevel = tree;

            // 각 폴더 레벨에 대해 트리 구조 생성
            parts.forEach((part) => {
                if (!part) return; // 빈 문자열 무시

                if (!currentLevel[part]) {
                    const pathSoFar = parts.slice(0, parts.indexOf(part) + 1);
                    currentLevel[part] = {
                        _files: [],
                        _path: path.join(basePath, ...pathSoFar),
                    };
                }
                currentLevel = currentLevel[part];
            });

            // 현재 레벨(폴더)에 파일 추가
            currentLevel._files.push({
                name: fileName,
                path: file,
            });
        } catch (error) {
            console.error(`Error processing file ${file}:`, error);
        }
    });

    return tree;
}

// 트리 노드 토글 함수
function toggleTreeFolder(event) {
    const header = event.currentTarget;
    const folderContent = header.nextElementSibling;
    folderContent.classList.toggle('open');

    const toggleIcon = header.querySelector('.tree-toggle');
    if (folderContent.classList.contains('open')) {
        toggleIcon.textContent = '▼';
    } else {
        toggleIcon.textContent = '►';
    }
}

// 알림 표시 함수
function showNotification(message) {
    // 이미 있는 알림 제거
    const existingNotification = document.getElementById('notification');
    if (existingNotification) {
        document.body.removeChild(existingNotification);
    }

    // 새 알림 생성
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = 'notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    // 3초 후 알림 제거
    setTimeout(() => {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    }, 3000);
}

// 클립보드에 텍스트 복사
function copyToClipboard(text) {
    // 임시 textarea 요소 생성
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; // 화면 밖으로
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    // 텍스트 선택 및 복사
    textarea.select();
    document.execCommand('copy');

    // 임시 요소 제거
    document.body.removeChild(textarea);

    // 복사 완료 알림
    showNotification(`복사됨: ${text}`);
}

// 폴더 열기 함수
function openFolder(folderPath) {
    ipcRenderer.send('open-containing-folder', folderPath);
}

// 시스템 폴더 버튼 이벤트 설정
function setupSystemFolderButtons() {
    document.getElementById('btn-desktop').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'desktop');
    });

    document.getElementById('btn-documents').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'documents');
    });

    document.getElementById('btn-downloads').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'downloads');
    });

    document.getElementById('btn-pictures').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'pictures');
    });

    document.getElementById('btn-music').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'music');
    });

    document.getElementById('btn-videos').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'videos');
    });

    document.getElementById('btn-appdata').addEventListener('click', () => {
        ipcRenderer.send('get-system-folder', 'appData');
    });
}

// ESC 키 이벤트 처리 함수
function setupEscKeyHandler(closeFunction) {
    document.addEventListener('keydown', (event) => {
        // ESC 키가 눌렸을 때
        if (event.key === 'Escape') {
            // 기본 동작 방지
            event.preventDefault();

            // 확인 대화상자 표시
            const closeConfirm = confirm('정말로 창을 닫으시겠습니까?');

            // 사용자가 확인을 눌렀을 때만 창 닫기
            if (closeConfirm) {
                closeFunction();
            }
        }
    });
}

// 엔터 키 이벤트 처리 함수
function setupEnterKeyHandler(inputId, clickFunction) {
    document.getElementById(inputId).addEventListener('keypress', (event) => {
        // 엔터 키가 눌렸을 때
        if (event.key === 'Enter') {
            // 기본 폼 제출 동작 방지
            event.preventDefault();
            // 지정된 함수 실행
            clickFunction();
        }
    });
}

// 모듈 내보내기
module.exports = {
    groupFilesByFolder,
    toggleTreeFolder,
    showNotification,
    copyToClipboard,
    openFolder,
    setupSystemFolderButtons,
    setupEscKeyHandler,
    setupEnterKeyHandler,
};
