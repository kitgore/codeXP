import * as vscode from 'vscode';
let statusBar: vscode.StatusBarItem;
const MAX_ELAPSED_TIME_IN_SECONDS = 5 * 60; // cap to 5 minutes
const DEFAULT_FREQUENCY = .9; // Lower this number to widen the sine curve
const DEFAULT_BASE_DELAY = 10; //delay fluctuates between baseDelay and baseDelay + sinRange
const DEFAULT_SIN_RANGE = 3;

export function activate(context: vscode.ExtensionContext) {
    setupStatusBar(context);
    listenForXPAddCommand(context);
    listenForShowInfoCommand(context);
    listenForDocumentSave(context);
    updateStatusBar(getXP(context)); //initialize status bar
}

function setupStatusBar(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();
    statusBar.color = 'red';
    context.subscriptions.push(statusBar);
    getStatusbarColor(context).then(rgb => {
        statusBar.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${1})`;
    }).catch(error => {
        vscode.window.showInformationMessage(error);
    });
}

function getStatusbarColor(context: vscode.ExtensionContext): Promise<{ r: number, g: number, b: number } | {r: 255, g: 255, b: 255}> {
    return new Promise((resolve, reject) => {
        const panel = vscode.window.createWebviewPanel(
            'themeInfo', 
            'Theme Information', 
            vscode.ViewColumn.One, 
            {
                enableScripts: true
            }
        );
        panel.webview.html = getWebViewContent();
        panel.webview.onDidReceiveMessage(
            message => {
                let iconForeground;
                for (let obj of message) {
                    const key = Object.keys(obj)[0];
                    if (key === '--vscode-statusBar-foreground') {
                        iconForeground = obj[key];
                        break;
                    }
                }
                if (iconForeground) {
                    const rgb = hexToRgb(iconForeground);
                    if (rgb) {
                        vscode.window.showInformationMessage(`Icon foreground color is rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
                        resolve(rgb);
                    } else {
                        reject();
                    }
                } else {
                    reject();
                }
                panel.dispose();
            },
            undefined,
            context.subscriptions
        );
    });
}

function hexToRgb(hex: string): {r: number, g: number, b: number}{
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : {r: 255, g: 255, b: 255};
}

function getWebViewContent() {
    const nonce = getNonce();
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            vscode.postMessage(Object.values(document.getElementsByTagName('html')[0].style).map(
                (rv) => {
                    return {
                        [rv]: document.getElementsByTagName('html')[0].style.getPropertyValue(rv),
                    }
                }
            ));
        </script>
    </body>
    </html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function listenForXPAddCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('codexp.addXP', async () => {
        let xpToAdd = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to add:' });
        if (xpToAdd !== undefined) {
            let newXP = getXP(context) + parseInt(xpToAdd);
            animateProgressBar(getXP(context), newXP);
            setXP(context, newXP);
        }
    }));
}

function listenForShowInfoCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('codexp.showInfo', () => {
        let totalXP = getXP(context);
        let level = calculateLevel(totalXP);
        let xpForLevel = calculateXPforLevel(level + 1);
        let currentXPProgress = totalXP - calculateTotalXP(level);
        let xpNeededForNextLevel = xpForLevel - currentXPProgress;
        vscode.window.showInformationMessage(`You are level ${level}. XP: ${currentXPProgress}. XP needed for next level: ${xpNeededForNextLevel}`);
    }));
}

function listenForDocumentSave(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
        let lastSaveTime = getLastSaveTime(context);
        lastSaveTime = lastSaveTime ? new Date(lastSaveTime) : undefined;  //Restores to original format (date object)
        setLastSaveTime(context); //sets the global to current time after retrieved
        let oldXP = getXP(context);
        let newXP = oldXP + getElapsedTimeInSeconds(lastSaveTime) + (isNewDay(lastSaveTime) ? 1000 : 0); //add elapsed XP and daily bonus
        animateProgressBar(oldXP, newXP);
        setXP(context, newXP);
    }));
}

function getElapsedTimeInSeconds(lastSaveTime: Date | undefined): number{
    let now = new Date();
    if (lastSaveTime) {
        let elapsedTime = now.getTime() - lastSaveTime.getTime();
        let elapsedTimeInSeconds = Math.floor(elapsedTime / 1000);
        return lastSaveTime ? Math.min(elapsedTimeInSeconds, MAX_ELAPSED_TIME_IN_SECONDS) : 0;
    }
    return 0;
}
function isNewDay(lastSaveTime: Date | undefined): boolean {
    let currentTime = new Date();
    if (!lastSaveTime) {
        return true;  // This is the first save, so it's a new day
    }
    return currentTime.getDate() !== lastSaveTime.getDate() || currentTime.getMonth() !== lastSaveTime.getMonth();
}

function getXP(context: vscode.ExtensionContext) {
    return context.globalState.get<number>('totalXP') || 0;
}
function setXP(context: vscode.ExtensionContext, xp: number) {
    context.globalState.update('totalXP', xp);
}
function getLastSaveTime(context: vscode.ExtensionContext): Date | undefined {
    return context.globalState.get<Date>('lastSaveTime');
}
function setLastSaveTime(context: vscode.ExtensionContext, date: Date = new Date()){
    context.globalState.update('lastSaveTime', date);
}

function calculateLevel(totalXP: number): number {
    //calculate the level given the total XP using quadratic formula
    var n = (-950 + Math.sqrt(950 * 950 + 200 * totalXP))/100;
    return Math.floor(n);
}
function calculateXPforLevel(level: number): number {
    //calculate the additional XP needed to reach given level
    return 1000 + (level-1) * 100;
}
function calculateTotalXP(level: number): number {
    //calculate the total XP needed to reach given level
    return 1000 * level + 100 * level * (level - 1) / 2;
}

function createProgressBar(current: number, total: number, barSize: number = 10): string {
    current = Math.min(Math.max(current, 0), total);
    let percentage = current / total;
    let progress = Math.floor(percentage * barSize);
    let icons = ['progress-4', 'progress-5', 'progress-6', 'progress-7', 'progress-8', 'progress-9', 'progress-10', 'progress-11', 'progress-12', 'progress-14', 'progress-13'];
    let progressBar = '$(progress-beginning)'; // Initialize the progress bar with the beginning icon.
    
    // Adds full progress icons to the progressBar.
    for (let i = 0; i < progress; i++) {
        progressBar += `$(progress-15)`;
    }
    
    if (progress < barSize) {
        let fraction = (percentage * barSize) % 1;
        let iconIndex = Math.floor(fraction * (icons.length - 1));
        progressBar += `$(${icons[iconIndex]})`;
        // Check if icon runs over into the next icon
        if (iconIndex === icons.length - 2 || iconIndex === icons.length - 3) {
            if (progress === barSize - 1) {
                if(iconIndex === icons.length - 3) {
                    progressBar += `$(progress-end-2)`;
                }
                else if(iconIndex === icons.length - 2) {
                    progressBar += `$(progress-end-3)`;
                }
                return progressBar;
            }
            else{
                if(iconIndex === icons.length - 3) {
                    progressBar += '$(progress-1)';
                }
                if(iconIndex === icons.length - 2) {
                    progressBar += '$(progress-3)';
                }
                progress++;
            }
        }
    }
    // Add the remaining empty space.
    for (let i = progress + 1; i < barSize; i++) {
        progressBar += '$(progress-1)';
    }
    progressBar += '$(progress-end-1)';
    return progressBar;
}

function updateStatusBar(currentXP: number) {
    let level = calculateLevel(currentXP);
    let xpForLevel = calculateXPforLevel(level + 1);
    let xpProgressToNextLevel = currentXP - calculateTotalXP(level);
    let progressBar = createProgressBar(xpProgressToNextLevel, xpForLevel, 10);
    
    statusBar.text = `Lvl ${level}: ${progressBar}`;
}

function animateProgressBar(oldXP: number, newXP: number, steps: number = 100) {
    steps = (newXP - oldXP) / 17; 
    let xpPerStep = (newXP - oldXP) / steps;
    let currentXP = oldXP;

    for (let i = 0; i < steps; i++) {
        let ratio = i / steps;
        let delay = DEFAULT_BASE_DELAY - DEFAULT_SIN_RANGE * Math.sin(Math.PI * ratio * DEFAULT_FREQUENCY);

        setTimeout(() => {
            currentXP += xpPerStep;
            updateStatusBar(currentXP);
        }, i * delay);
    }
}


//implement color getting using this hack
//https://github.com/microsoft/vscode/issues/32813#issuecomment-798680103

//use this to create webview
//https://code.visualstudio.com/api/extension-guides/webview

// function listenForThemeChange(context: vscode.ExtensionContext) {
//     context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
//         createWebView(context);
//     }));
// }