import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { asciiToSymbolMap } from './asciiToSymbolMap';
let statusBar: vscode.StatusBarItem;
const MAX_ELAPSED_TIME_IN_SECONDS = 5 * 60; // cap to 5 minutes

export function activate(context: vscode.ExtensionContext) {
    setupStatusBar(context);
    cacheCurrentThemeTitle(context);
    listenForShowInfoCommand(context);
    listenForDocumentSave(context);
    listenForThemeChange(context);
    updateStatusBar(getXP(context));
    // listenForXPAddCommand(context);
    // listenForXPSetCommand(context);
    // setLastSaveTime(context, new Date((new Date()).getTime() - 1000 * 60 * 60 * 24)); //ADDS 24 HOURS TO LAST SAVE TIME
}

function listenForThemeChange(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        context.globalState.update('themeChangeFlag',true);
    }));
}

function listenForShowInfoCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('codexp.showInfo', () => {
        let totalXP = getXP(context);
        let level = calculateLevel(totalXP);
        let xpForLevel = calculateXPforLevel(level + 1);
        let currentXPProgress = totalXP - calculateTotalXP(level);
        getCurrentStreak(context) <= 1 ? 
            splashText(context, [`${currentXPProgress}/${xpForLevel} XP`], 1500) 
            : splashText(context, [`${currentXPProgress}/${xpForLevel} XP`, `Streak: ${getCurrentStreak(context)}`, `Multiplier: ${calculateMultiplier(getCurrentStreak(context))}X`], 1500);
    }));
}

function listenForDocumentSave(context: vscode.ExtensionContext): void {
    //either updates theme or adds XP based on flag
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
        if(context.globalState.get<boolean>('themeChangeFlag') === true){
            context.globalState.update('themeChangeFlag', false);
            themeRefresh(context);
        }
        else{
            const lastSaveTime = getLastSaveTime(context);
            const lastSaveDate = lastSaveTime ? new Date(lastSaveTime) : undefined; // Restores to original format (date object)
            setLastSaveTime(context); // Sets the global to the current time after retrieved
            const oldXP = getXP(context);
            const newXP = Math.floor(oldXP) + Math.floor((getElapsedTimeInSeconds(lastSaveDate) + (isNewDay(lastSaveDate) ? 1000 : 0)) * calculateMultiplier(getCurrentStreak(context))); // Add elapsed XP and daily bonus

            isNewDay(lastSaveDate) ? // Show splash based on streak
                (addStreak(context, lastSaveDate),
                getCurrentStreak(context) <= 1 ?
                    splashText(context, [`Daily XP +${Math.ceil(1000 * calculateMultiplier(getCurrentStreak(context)))}`], 1500).then(() => {
                        animateProgressBar(oldXP, newXP);})
                    :splashText(context, [`Daily XP +${Math.ceil(1000 * calculateMultiplier(getCurrentStreak(context)))}`, `Streak: ${getCurrentStreak(context)}`], 1500).then(() => {
                        animateProgressBar(oldXP, newXP);}))
                : animateProgressBar(oldXP, newXP);
                setXP(context, newXP);
        }
    }));
}

function calculateMultiplier(streak: number): number {
    const multiplier = streak <= 1 ? 1.0 : 1.0 + streak * 0.05;
    return parseFloat(multiplier.toFixed(2));
}

function addStreak(context: vscode.ExtensionContext, lastSaveTime: Date | undefined): void {
    function isSameDate(date1: Date, date2: Date): boolean {
        return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear();
    }
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastSaveTime && !isSameDate(lastSaveTime, today)) {
        lastSaveTime && isSameDate(lastSaveTime, yesterday) ?
        setCurrentStreak(context, getCurrentStreak(context) + 1) // Increment streak
        : setCurrentStreak(context, 1); // Reset streak
    }
}

function getCurrentThemeTitle(): string | undefined{
    return vscode.workspace.getConfiguration().get('workbench.colorTheme');
}

function cacheCurrentThemeTitle(context: vscode.ExtensionContext) {
    const currentThemeTitle = getCurrentThemeTitle();
    context.globalState.update('themeTitle', currentThemeTitle);
}

function themeRefresh(context: vscode.ExtensionContext): void {
    cacheCurrentThemeTitle(context);
    calculateStatusbarColor(context)
        .then(rgb => setStatusbarColor(context, rgb))
        .catch(error => vscode.window.showInformationMessage(error));
}

async function setupStatusBar(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();
    context.subscriptions.push(statusBar);
    context.globalState.get('themeTitle') !== getCurrentThemeTitle() ?
        themeRefresh(context)
        : setStatusbarColor(context, getStatusbarColor(context));
}

function calculateStatusbarColor(context: vscode.ExtensionContext): Promise<{ r: number, g: number, b: number } | { r: 255, g: 255, b: 255 }> {
    //hacky way to retrieve theme color by creating a webview and reading its style by @AllanOricil 
    //https://github.com/microsoft/vscode/issues/32813#issuecomment-798680103
    return new Promise((resolve, reject) => {
        const panel = vscode.window.createWebviewPanel('themeInfo', 'Theme Information', vscode.ViewColumn.Beside, { enableScripts: true });
        panel.webview.html = getWebViewContent();
        panel.webview.onDidReceiveMessage(message => {
            for (let obj of message) {
                const key = Object.keys(obj)[0];
                if (key === '--vscode-statusBar-foreground') {
                    const rgb = hexToRgb(obj[key]); 
                    rgb ? resolve(rgb) : reject();
                    panel.dispose();
                    return;
                }
            }
            reject();
            panel.dispose();
        }, undefined, context.subscriptions);
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

async function splashText(context: vscode.ExtensionContext, text: string[], duration = 1000, fadeDelay = 300, additionalDelay = 400) {
    const statusLength = 24 + Math.floor(Math.log10(calculateLevel(getXP(context))));
    let oldText = statusBar.text;
    for (let i = 0; i < text.length; i++) {
        let output = ' '.repeat((statusLength - text[i].length)/2) + text[i] + ' '.repeat(((statusLength - text[i].length)/2) + (statusLength - text[i].length)%2);
        await fadeStatusBar(context);
        statusBar.text = convertToSymbolString(output);
        await fadeStatusBar(context, true, fadeDelay);
        await delay(duration);
    }
    await fadeStatusBar(context);
    statusBar.text = oldText;
    await fadeStatusBar(context, true, fadeDelay);
    await delay(additionalDelay);
}

async function fadeStatusBar(context: vscode.ExtensionContext, fadeIn = false, duration = 300) {
    let step = 0.05; // step size for changing alpha value
    let interval = duration * step;
    const rgb = context.globalState.get('statusBarColor') as { r: number, g: number, b: number };
    let alpha = fadeIn ? 0.0 : 1.0;
    const updateColor = (): Promise<void> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                alpha = fadeIn ? alpha + step : alpha - step;
                if (alpha < 0) { alpha = 0; }
                if (alpha > 1) { alpha = 1; }
                statusBar.color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                // If alpha is still less than 1 for fadeIn, or more than 0 for fadeOut, schedule another update
                // otherwise, resolve the Promise
                if ((fadeIn && alpha < 1) || (!fadeIn && alpha > 0)) {
                    resolve(updateColor());
                } else {
                    resolve();
                }
            }, interval);
        });
    };
    await updateColor();
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
function getStatusbarColor(context: vscode.ExtensionContext): { r: number, g: number, b: number } {
    return context.globalState.get('statusBarColor') as { r: number, g: number, b: number };
}
function setStatusbarColor(context: vscode.ExtensionContext, color: { r: number, g: number, b: number }) {
    context.globalState.update('statusBarColor', color);
    statusBar.color = `rgba(${color.r}, ${color.g}, ${color.b}, ${1})`;
}
function getCurrentStreak(context: vscode.ExtensionContext): number {
    let streak = context.globalState.get<number>('currentStreak');
    if (streak === undefined) {
        return 0;
    }
    return streak;
}
function setCurrentStreak(context: vscode.ExtensionContext, streak: number) {
    context.globalState.update('currentStreak', streak);
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
    let icons = ['progress-3', 'progress-4', 'progress-5', 'progress-6', 'progress-7', 'progress-8', 'progress-9', 'progress-10', 'progress-11', 'progress-12'];
    let progressBar = '$(progress-beginning)'; // Initialize the progress bar with the beginning icon.
    
    // Adds full progress icons to the progressBar.
    for (let i = 0; i < progress; i++) {
        progressBar += `$(progress-13)`;
    }
    
    if (progress < barSize) {
        let fraction = (percentage * barSize) % 1;
        let iconIndex = Math.floor(fraction * (icons.length - 1));
        progressBar += `$(${icons[iconIndex]})`;
        // Check if icon runs over into the next icon
        if (iconIndex === icons.length - 1) {
            if (progress === barSize - 1) {
                progressBar += `$(progress-end-2)`;
                return progressBar;
            }
            else{
                progressBar += '$(progress-3)';
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
    statusBar.text = convertToSymbolString(`${level}:`) + `${progressBar}`;
}

function calculateTotalPercentage(oldXP: number, newXP: number): number {
    //calculate the total animations steps between oldXP and newXP
    let oldLevel = calculateLevel(oldXP);
    let newLevel = calculateLevel(newXP);
    let oldXPforLevel = calculateXPforLevel(oldLevel + 1);
    let newXPforLevel = calculateXPforLevel(newLevel + 1);
    let oldXPProgressToNextLevel = oldXP - calculateTotalXP(oldLevel);
    let newXPProgressToNextLevel = newXP - calculateTotalXP(newLevel);
    let oldPercentage = parseFloat((oldXPProgressToNextLevel / oldXPforLevel).toFixed(2)) * 100;
    let newPercentage = parseFloat((newXPProgressToNextLevel / newXPforLevel).toFixed(2)) * 100;
    return Math.round((newPercentage - oldPercentage) + 100 * (newLevel - oldLevel));
}

function animateProgressBar(oldXP: number, newXP: number): void {
    let perc = Math.min(80, calculateTotalPercentage(oldXP, newXP));
    let steps = Math.min(perc, 100);
    let xpPerStep = (newXP - oldXP) / steps;
    // Calculate the baseDelayFactor based on a direct relationship with percentage difference
    // Use a maximum of 100 to prevent overly slow animations, and a minimum to prevent overly fast animations
    let baseDelayFactor = (.003 * perc * perc) - (.65 * perc) + 50;
    let baseDelay: number[] = Array(steps).fill(0).map((_, i) => baseDelayFactor - 8 * Math.sin(Math.PI * (i / steps)));
    let delays: number[] = baseDelay.reduce((acc, val, i) => {
        acc[i] = (i === 0) ? val : acc[i - 1] + val;
        return acc;
    }, [] as number[]);
    let currentXP = oldXP;
    for (let i = 0; i < steps; i++) {
        setTimeout(() => {
            currentXP += xpPerStep;
            updateStatusBar(Math.round(currentXP));
        }, delays[i]);
    }
    setTimeout(() => updateStatusBar(newXP), delays[steps - 1]);
}

//getStatusBar helper functions
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
    let htmlPath = path.resolve(__dirname, '../src/themeWebview.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    return htmlContent.replace(/\$\{nonce\}/g, nonce);
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function convertToSymbolString(input: string): string {
    //converts string to string of font icons $(sm-example)
    let symbolString = "";
    for (let i = 0; i < input.length; i++) {
      let charCode = input.charCodeAt(i);
      if (charCode >= 32 && charCode <= 126) {
        let symbol = asciiToSymbolMap[charCode];
        if (symbol) {
          symbolString += `$(sm-${symbol})`; //imported from asciiToSymbolMap.ts
        }
      }
    }
    return symbolString;
  }  

// function listenForXPAddCommand(context: vscode.ExtensionContext) {  //REMOVE BEFORE PROD
//     context.subscriptions.push(vscode.commands.registerCommand('codexp.addXP', async () => {
//         let xpToAdd = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to add:' });
//         if (xpToAdd !== undefined) {
//             let newXP = getXP(context) + parseInt(xpToAdd);
//             animateProgressBar(getXP(context), newXP);
//             setXP(context, newXP);
//         }
//     }));
// }

// function listenForXPSetCommand(context: vscode.ExtensionContext) {  //REMOVE BEFORE PROD
//     context.subscriptions.push(vscode.commands.registerCommand('codexp.setXP', async () => {
//         let xpToSet = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to set:' });
//         if (xpToSet !== undefined) {
//             let newXP = parseInt(xpToSet);
//             setXP(context, newXP);
//             updateStatusBar(newXP);
//         }
//     }));
// }