import {
    BrowserWindow,
    Menu,
    MenuItem,
    MenuItemConstructorOptions,
    app,
} from 'electron';

export const createMenu = (mainWindow: BrowserWindow): Menu => {
    const template: MenuItemConstructorOptions[] = [
        {
            label: '파일',
            submenu: [
                {
                    label: '새 파일',
                    accelerator: 'CommandOrControl+N',
                    click: () => {
                        console.log('새 파일');
                    },
                },
                {
                    label: '열기',
                    accelerator: 'CommandOrControl+O',
                    click: () => {
                        console.log('파일 열기');
                    },
                },
                {
                    label: '저장',
                    accelerator: 'CommandOrControl+S',
                    click: () => {
                        console.log('파일 저장');
                    },
                },
                {
                    label: '다른 이름으로 저장',
                    accelerator: 'CommandOrControl+Shift+S',
                    click: () => {
                        console.log('다른 이름으로 저장');
                    },
                },
                { type: 'separator' },
                {
                    label: '파일명 찾기',
                    accelerator: 'CommandOrControl+Shift+F',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-file-finder');
                        }
                    },
                },
                {
                    label: '파일명 찾기 & 바꾸기',
                    accelerator: 'CommandOrControl+Shift+R',
                    click: (
                        menuItem: MenuItem,
                        browserWindow: BrowserWindow | null
                    ) => {
                        if (browserWindow) {
                            browserWindow.webContents.send(
                                'open-rename-window'
                            );
                        }
                    },
                },
                { type: 'separator' },
                {
                    label: '인쇄',
                    accelerator: 'CommandOrControl+P',
                    click: () => {
                        console.log('인쇄');
                    },
                },
                { type: 'separator' },
                {
                    label: '종료',
                    accelerator:
                        process.platform === 'darwin' ? 'Command+Q' : 'Alt+F4',
                    role: 'quit',
                },
            ],
        },
        {
            label: '편집',
            submenu: [
                {
                    label: '실행 취소',
                    accelerator: 'CommandOrControl+Z',
                    role: 'undo',
                },
                {
                    label: '다시 실행',
                    accelerator:
                        process.platform === 'darwin'
                            ? 'Shift+Command+Z'
                            : 'Control+Y',
                    role: 'redo',
                },
                { type: 'separator' },
                {
                    label: '잘라내기',
                    accelerator: 'CommandOrControl+X',
                    role: 'cut',
                },
                {
                    label: '복사',
                    accelerator: 'CommandOrControl+C',
                    role: 'copy',
                },
                {
                    label: '붙여넣기',
                    accelerator: 'CommandOrControl+V',
                    role: 'paste',
                },
                { type: 'separator' },
                {
                    label: '모두 선택',
                    accelerator: 'CommandOrControl+A',
                    role: 'selectAll',
                },
                { type: 'separator' },
                {
                    label: '찾기',
                    accelerator: 'CommandOrControl+F',
                    click: (
                        menuItem: MenuItem,
                        browserWindow: BrowserWindow | null
                    ) => {
                        if (browserWindow) {
                            browserWindow.webContents.send('find-in-page');
                        }
                    },
                },
                {
                    label: '다음 찾기',
                    accelerator: 'F3',
                    click: (
                        menuItem: MenuItem,
                        browserWindow: BrowserWindow | null
                    ) => {
                        if (browserWindow) {
                            browserWindow.webContents.send('find-next');
                        }
                    },
                },
                {
                    label: '이전 찾기',
                    accelerator: 'Shift+F3',
                    click: (
                        menuItem: MenuItem,
                        browserWindow: BrowserWindow | null
                    ) => {
                        if (browserWindow) {
                            browserWindow.webContents.send('find-previous');
                        }
                    },
                },
                {
                    label: '찾기 & 바꾸기',
                    accelerator: 'CommandOrControl+H',
                    click: (
                        menuItem: MenuItem,
                        browserWindow: BrowserWindow | null
                    ) => {
                        if (browserWindow) {
                            browserWindow.webContents.send('find-replace');
                        }
                    },
                },
            ],
        },
        {
            label: '보기',
            submenu: [
                {
                    label: '새로고침',
                    accelerator: 'F5',
                    role: 'reload',
                },
                {
                    label: '강제 새로고침',
                    accelerator: 'CommandOrControl+F5',
                    role: 'forceReload',
                },
                {
                    label: '개발자 도구',
                    accelerator:
                        process.platform === 'darwin' ? 'Alt+Command+I' : 'F12',
                    role: 'toggleDevTools',
                },
                { type: 'separator' },
                {
                    label: '확대',
                    accelerator: 'CommandOrControl+Plus',
                    role: 'zoomIn',
                },
                {
                    label: '축소',
                    accelerator: 'CommandOrControl+-',
                    role: 'zoomOut',
                },
                {
                    label: '원래 크기',
                    accelerator: 'CommandOrControl+0',
                    role: 'resetZoom',
                },
                { type: 'separator' },
                {
                    label: '전체 화면',
                    accelerator: 'F11',
                    role: 'togglefullscreen',
                },
            ],
        },
        {
            label: '도움말',
            submenu: [
                {
                    label: '단축키 목록',
                    accelerator: 'F1',
                    click: () => {
                        console.log('단축키 목록 표시');
                    },
                },
                {
                    label: '프로그램 정보',
                    click: () => {
                        console.log('프로그램 정보 표시');
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
};
