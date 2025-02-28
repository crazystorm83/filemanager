const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { createMenu } = require('./menu');
const xlsx = require('xlsx');

// CPU 코어 수 가져오기
const cpuCount = os.cpus().length;

// fs 함수의 프로미스 버전 생성
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const readFileAsync = promisify(fs.readFile);
const renameAsync = promisify(fs.rename);

// 검색 캐시 및 작업 취소를 위한 변수들
const searchCache = new Map();
let currentSearchCancel = null;

// 검색 시간 제한 (기본값 30초)
const DEFAULT_SEARCH_TIMEOUT = 30000;

// 파일 검색 함수 개선
async function findFiles(directory, pattern, timeoutSeconds = 30) {
    // 이전 검색 취소
    if (currentSearchCancel) {
        currentSearchCancel();
    }

    // 새로운 취소 토큰 생성
    let isCancelled = false;
    let isTimedOut = false;
    currentSearchCancel = () => {
        isCancelled = true;
    };

    // 타임아웃 설정
    const timeoutMs = timeoutSeconds * 1000;
    const searchStartTime = Date.now();

    // 캐시 키 생성
    const cacheKey = `${directory}:${pattern}`;

    // 캐시된 결과가 있으면 반환
    if (searchCache.has(cacheKey)) {
        const cached = searchCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30000) {
            return cached.files;
        }
    }

    const files = [];
    const skippedDirs = [];
    const processedPaths = new Set();

    // 패턴을 정규식으로 변환
    let regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');

    // 병렬 처리를 위한 작업자 풀 크기
    const MAX_WORKERS = cpuCount; // 시스템의 CPU 코어 수만큼 작업자 생성
    const pendingDirectories = [directory];
    const activeWorkers = new Set();

    // 디렉토리 처리 작업자 함수
    async function worker() {
        while (pendingDirectories.length > 0 && !isCancelled && !isTimedOut) {
            // 시간 초과 체크
            if (Date.now() - searchStartTime > timeoutMs) {
                isTimedOut = true;
                break;
            }

            const dir = pendingDirectories.shift();
            if (!dir || processedPaths.has(dir)) continue;
            processedPaths.add(dir);

            try {
                // 시스템 폴더 건너뛰기
                if (
                    dir.endsWith('System Volume Information') ||
                    dir.endsWith('$RECYCLE.BIN') ||
                    dir.endsWith('$Recycle.Bin') ||
                    dir.includes('WindowsApps') ||
                    dir.includes('node_modules') ||
                    dir.includes('.git')
                ) {
                    skippedDirs.push(dir);
                    continue;
                }

                const entries = await readdirAsync(dir);
                await Promise.all(
                    entries.map(async (entry) => {
                        if (isCancelled) return;

                        const entryPath = path.join(dir, entry);
                        try {
                            const stats = await statAsync(entryPath);
                            if (stats.isDirectory()) {
                                pendingDirectories.push(entryPath);
                            } else if (stats.isFile() && regex.test(entry)) {
                                files.push(entryPath);
                            }
                        } catch (err) {
                            if (err.code === 'EPERM' || err.code === 'EACCES') {
                                skippedDirs.push(entryPath);
                            }
                        }
                    })
                );
            } catch (err) {
                if (err.code === 'EPERM' || err.code === 'EACCES') {
                    skippedDirs.push(dir);
                }
            }
        }
    }

    try {
        // 병렬 작업자 시작
        const workers = Array(MAX_WORKERS)
            .fill(null)
            .map(() => worker());
        await Promise.all(workers);

        // 결과 캐시 저장 (시간 초과가 아닌 경우에만)
        if (!isCancelled && !isTimedOut) {
            searchCache.set(cacheKey, {
                files: files,
                timestamp: Date.now(),
            });

            // 캐시 크기 제한 (최대 100개)
            if (searchCache.size > 100) {
                const oldestKey = Array.from(searchCache.keys())[0];
                searchCache.delete(oldestKey);
            }
        }

        return { files, isTimedOut };
    } finally {
        currentSearchCancel = null;
    }
}

let mainWindow = null;
let fileFinderWindow = null;
let fileReplaceWindow = null;

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

// 파일명 찾기 & 바꾸기 창 열기
function openFileReplaceWindow() {
    if (fileReplaceWindow) {
        fileReplaceWindow.focus();
        return;
    }

    fileReplaceWindow = new BrowserWindow({
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

    // 메뉴바 제거
    fileReplaceWindow.setMenu(null);

    fileReplaceWindow.loadFile(path.join(__dirname, '../file-replace.html'));

    // 현재 작업 디렉토리 전달
    fileReplaceWindow.webContents.on('did-finish-load', () => {
        fileReplaceWindow.webContents.send('init-folder-path', process.cwd());
    });

    fileReplaceWindow.on('closed', () => {
        fileReplaceWindow = null;
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
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow) return;

    const { canceled, filePaths } = await dialog.showOpenDialog(sourceWindow, {
        properties: ['openDirectory'],
        title: '폴더 선택',
    });

    if (!canceled && filePaths.length > 0) {
        sourceWindow.webContents.send('selected-folder', filePaths[0]);
    }
});

// 시스템 폴더 경로 요청 처리
ipcMain.on('get-system-folder', (event, folderType) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow) return;

    try {
        const folderPath = getSystemFolderPath(folderType);

        // 폴더가 존재하는지 확인
        if (fs.existsSync(folderPath)) {
            sourceWindow.webContents.send('selected-folder', folderPath);
        } else {
            dialog.showMessageBox(sourceWindow, {
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

ipcMain.on(
    'find-files',
    async (event, { folderPath, filePattern, timeoutSeconds = 30 }) => {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        if (!sourceWindow) return;

        try {
            const { files, isTimedOut } = await findFiles(
                folderPath,
                filePattern,
                timeoutSeconds
            );

            if (isTimedOut) {
                const response = await dialog.showMessageBox(sourceWindow, {
                    type: 'question',
                    title: '검색 시간 초과',
                    message: `검색 시간이 ${timeoutSeconds}초를 초과했습니다.`,
                    detail: `현재까지 ${files.length}개의 파일이 검색되었습니다. 검색된 결과를 표시하시겠습니까?`,
                    buttons: ['예', '아니오'],
                    defaultId: 0,
                    cancelId: 1,
                });

                if (response.response === 0) {
                    // 사용자가 '예'를 선택한 경우
                    sourceWindow.webContents.send('search-results', files);
                    if (mainWindow && sourceWindow !== mainWindow) {
                        mainWindow.webContents.send(
                            'file-search-results',
                            files
                        );
                    }
                }
            } else {
                // 정상적으로 검색이 완료된 경우
                sourceWindow.webContents.send('search-results', files);
                if (mainWindow && sourceWindow !== mainWindow) {
                    mainWindow.webContents.send('file-search-results', files);
                }
            }
        } catch (error) {
            dialog.showErrorBox(
                '검색 오류',
                `파일 검색 중 오류가 발생했습니다: ${error.message}`
            );
        }
    }
);

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

// 파일 선택 다이얼로그 열기
ipcMain.on('open-file-dialog', async (event, options) => {
    if (!fileReplaceWindow) return;

    const { canceled, filePaths } = await dialog.showOpenDialog(
        fileReplaceWindow,
        {
            properties: ['openFile'],
            filters: [
                {
                    name: options.type === 'text' ? '텍스트 파일' : '엑셀 파일',
                    extensions: options.extensions,
                },
            ],
        }
    );

    if (!canceled && filePaths.length > 0) {
        event.reply('selected-file', {
            type: options.type,
            path: filePaths[0],
        });
    }
});

// 파일명 바꾸기 실행
ipcMain.on('rename-files', async (event, options) => {
    try {
        const { files, renameType, renameValue } = options;
        let newNames = [];

        // 이름 변경 방식에 따라 처리
        switch (renameType) {
            case 'text':
                // 직접 입력한 텍스트로 변경
                newNames = files.map(() => renameValue);
                break;

            case 'textfile':
                // 텍스트 파일에서 읽기
                const textContent = await readFileAsync(renameValue, 'utf8');
                newNames = textContent
                    .split('\n')
                    .map((name) => name.trim())
                    .filter((name) => name);
                break;

            case 'excel':
                // 엑셀 파일에서 읽기
                const workbook = xlsx.readFile(renameValue);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                newNames = xlsx.utils
                    .sheet_to_json(worksheet, { header: 1 })
                    .flat()
                    .filter((name) => name)
                    .map((name) => String(name).trim());
                break;
        }

        // 파일 수와 새 이름 수가 일치하는지 확인
        if (files.length !== newNames.length) {
            throw new Error('파일 수와 새 이름의 수가 일치하지 않습니다.');
        }

        // 파일 이름 변경 실행
        const results = await Promise.all(
            files.map(async (file, index) => {
                const oldPath = file;
                const dir = path.dirname(file);
                const ext = path.extname(file);
                const newPath = path.join(dir, newNames[index] + ext);

                try {
                    await renameAsync(oldPath, newPath);
                    return {
                        success: true,
                        oldPath,
                        newPath,
                    };
                } catch (error) {
                    return {
                        success: false,
                        oldPath,
                        error: error.message,
                    };
                }
            })
        );

        // 결과 전송
        event.reply('rename-results', results);
    } catch (error) {
        event.reply('rename-error', error.message);
    }
});

// 파일명 찾기 & 바꾸기 창 닫기
ipcMain.on('close-file-replace', () => {
    if (fileReplaceWindow) {
        fileReplaceWindow.close();
    }
});

// 파일명 찾기 & 바꾸기 창 닫기
ipcMain.on('open-file-replace', () => {
    openFileReplaceWindow();
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
