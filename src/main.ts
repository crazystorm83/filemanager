const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { createMenu } = require('./menu');

// fs 함수의 프로미스 버전 생성
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// 파일 검색 함수 구현
// 파일 검색 함수 개선
async function findFiles(directory, pattern) {
    const files = [];

    // 패턴을 정규식으로 변환
    let regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');

    // 접근 거부된 디렉토리 목록
    const skippedDirs = [];

    async function searchDirectory(dir) {
        try {
            // 특정 시스템 폴더 건너뛰기
            if (
                dir.endsWith('System Volume Information') ||
                dir.endsWith('$RECYCLE.BIN') ||
                dir.endsWith('$Recycle.Bin') ||
                dir.includes('WindowsApps')
            ) {
                skippedDirs.push(dir);
                return;
            }

            const entries = await readdirAsync(dir);

            for (const entry of entries) {
                const entryPath = path.join(dir, entry);

                try {
                    const stats = await statAsync(entryPath);

                    if (stats.isDirectory()) {
                        // 하위 디렉토리 검색
                        await searchDirectory(entryPath);
                    } else if (stats.isFile() && regex.test(entry)) {
                        // 패턴과 일치하는 파일 추가
                        files.push(entryPath);
                    }
                } catch (err) {
                    // 특정 파일/폴더 접근 오류는 무시하고 계속 진행
                    // console.error(`Error accessing ${entryPath}: ${err.message}`);
                    if (err.code === 'EPERM' || err.code === 'EACCES') {
                        skippedDirs.push(entryPath);
                    }
                }
            }
        } catch (err) {
            // console.error(`Error reading directory ${dir}: ${err.message}`);
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                skippedDirs.push(dir);
            }
        }
    }

    await searchDirectory(directory);

    // 만약 접근 거부된 디렉토리가 있다면 로그 출력 (선택사항)
    if (skippedDirs.length > 0) {
        console.log(
            `Skipped ${skippedDirs.length} directories due to access restrictions.`
        );
    }

    return files;
}

let mainWindow = null;
let fileFinderWindow = null;

// 시스템 폴더 경로 가져오기
function getSystemFolderPath(folderType) {
    switch (folderType) {
        case 'desktop':
            return path.join(os.homedir(), 'Desktop');
        case 'documents':
            return path.join(os.homedir(), 'Documents');
        case 'downloads':
            return path.join(os.homedir(), 'Downloads');
        case 'pictures':
            return path.join(os.homedir(), 'Pictures');
        case 'music':
            return path.join(os.homedir(), 'Music');
        case 'videos':
            return path.join(os.homedir(), 'Videos');
        case 'appData':
            return app.getPath('appData');
        default:
            return os.homedir();
    }
}

function createWindow() {
    // 브라우저 창 생성
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'policy', 'preload.js'),
        },
    });

    // HTML 파일 로드
    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // 메뉴 생성 및 설정
    createMenu(mainWindow);

    // 창이 닫히면 mainWindow 참조 제거
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 파일 찾기 창 열기
function openFileFinderWindow() {
    if (fileFinderWindow) {
        fileFinderWindow.focus();
        return;
    }

    fileFinderWindow = new BrowserWindow({
        width: 900,
        height: 800,
        parent: mainWindow,
        modal: false,
        resizable: true,
        minWidth: 400,
        minHeight: 400,
        minimizable: true,
        maximizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // 메뉴바 완전히 제거
    fileFinderWindow.setMenu(null);

    fileFinderWindow.loadFile(path.join(__dirname, '../file-finder.html'));

    // 현재 작업 디렉토리 전달
    fileFinderWindow.webContents.on('did-finish-load', () => {
        fileFinderWindow.webContents.send('init-folder-path', process.cwd());
    });

    // 창이 닫히면 fileFinderWindow 참조 제거
    fileFinderWindow.on('closed', () => {
        fileFinderWindow = null;
    });
}

// IPC 이벤트 리스너 등록
ipcMain.on('open-file-finder', () => {
    openFileFinderWindow();
});

ipcMain.on('close-file-finder', () => {
    if (fileFinderWindow) {
        fileFinderWindow.close();
    }
});

// 폴더 선택 다이얼로그 열기
ipcMain.on('open-folder-dialog', async (event) => {
    if (!fileFinderWindow) return;

    const { canceled, filePaths } = await dialog.showOpenDialog(
        fileFinderWindow,
        {
            properties: ['openDirectory'],
            title: '폴더 선택',
        }
    );

    if (!canceled && filePaths.length > 0) {
        fileFinderWindow.webContents.send('selected-folder', filePaths[0]);
    }
});

// 시스템 폴더 경로 요청 처리
ipcMain.on('get-system-folder', (event, folderType) => {
    if (!fileFinderWindow) return;

    try {
        const folderPath = getSystemFolderPath(folderType);

        // 폴더가 존재하는지 확인
        if (fs.existsSync(folderPath)) {
            fileFinderWindow.webContents.send('selected-folder', folderPath);
        } else {
            dialog.showMessageBox(fileFinderWindow, {
                type: 'error',
                title: '폴더 오류',
                message: `${folderType} 폴더를 찾을 수 없습니다.`,
            });
        }
    } catch (error) {
        console.error(`시스템 폴더 가져오기 오류: ${error.message}`);
        dialog.showErrorBox(
            '오류',
            `시스템 폴더를 가져오는 중 오류가 발생했습니다: ${error.message}`
        );
    }
});

ipcMain.on('find-files', async (event, { folderPath, filePattern }) => {
    try {
        // glob 대신 직접 구현한 findFiles 함수 사용
        const files = await findFiles(folderPath, filePattern);

        // 결과를 메인 창으로 전송
        if (mainWindow) {
            mainWindow.webContents.send('file-search-results', files);
        }

        // 결과를 파일 찾기 창으로도 전송
        if (fileFinderWindow) {
            fileFinderWindow.webContents.send('search-results', files);
        }
    } catch (error) {
        // 오류 발생 시
        const err = error;
        dialog.showErrorBox(
            '검색 오류',
            `파일 검색 중 오류가 발생했습니다: ${err.message}`
        );
    }
});

// 파일이 위치한 폴더 열기
ipcMain.on('open-containing-folder', (event, folderPath) => {
    try {
        // 해당 폴더가 존재하는지 확인
        if (fs.existsSync(folderPath)) {
            // 운영체제별로 다른 명령 사용
            switch (process.platform) {
                case 'win32':
                    // Windows
                    require('child_process').exec(`explorer "${folderPath}"`);
                    break;
                case 'darwin':
                    // macOS
                    require('child_process').exec(`open "${folderPath}"`);
                    break;
                case 'linux':
                    // Linux
                    require('child_process').exec(`xdg-open "${folderPath}"`);
                    break;
                default:
                    dialog.showErrorBox(
                        '오류',
                        `지원되지 않는 운영체제입니다: ${process.platform}`
                    );
            }
        } else {
            dialog.showErrorBox(
                '폴더 열기 오류',
                `폴더가 존재하지 않습니다: ${folderPath}`
            );
        }
    } catch (error) {
        dialog.showErrorBox(
            '폴더 열기 오류',
            `폴더를 열 수 없습니다: ${error.message}`
        );
    }
});

// Electron이 초기화되면 창 생성
app.whenReady().then(() => {
    createWindow();

    // Mac에서 앱 활성화 시 창이 없으면 창 생성
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 모든 창이 닫히면 애플리케이션 종료 (macOS 제외)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
