import * as vscode from 'vscode';

let statusBar: vscode.StatusBarItem;

const DEFAULT_XP = 0;
const MAX_ELAPSED_TIME_IN_SECONDS = 5 * 60; // cap to 5 minutes

export function activate(context: vscode.ExtensionContext) {
    setupStatusBar(context);
    listenForXPAddCommand(context);
    listenForShowInfoCommand(context);
    listenForDocumentSave(context);
    initializeStatusBar(context);
}

//implement color getting using this hack
//https://github.com/microsoft/vscode/issues/32813#issuecomment-798680103

//use this to create webview
//https://code.visualstudio.com/api/extension-guides/webview


function setupStatusBar(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

function listenForXPAddCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('codexp.addXP', async () => {
        let xpToAdd = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to add:' });
        if (xpToAdd !== undefined) {
            let newXP = getXP(context) + parseInt(xpToAdd);
            animateProgressBar(getXP(context), newXP);
            context.globalState.update('totalXP', newXP);
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

function setLastSaveTime(context: vscode.ExtensionContext, date: Date = new Date()){
    context.globalState.update('lastSaveTime', date);
}

function listenForDocumentSave(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
        let lastSaveTime = context.globalState.get<Date>('lastSaveTime');
        lastSaveTime = lastSaveTime ? new Date(lastSaveTime) : undefined;  //Restores to original format (date object)
        setLastSaveTime(context);
        let oldXP = getXP(context);
        let newXP = oldXP + getElapsedTimeInSeconds(lastSaveTime) + (isNewDay(lastSaveTime) ? 1000 : 0); //add elapsed XP and daily bonus
        animateProgressBar(oldXP, newXP);
        context.globalState.update('totalXP', newXP);
    }));
}

function isNewDay(lastSaveTime: Date | undefined): boolean {
    let currentTime = new Date();
    if (!lastSaveTime) {
        return true;  // This is the first save, so it's a new day
    }
    return currentTime.getDate() !== lastSaveTime.getDate() ||
           currentTime.getMonth() !== lastSaveTime.getMonth();
}

function getElapsedTimeInSeconds(lastSaveTime: Date | undefined): number{
    let now = new Date();
    if (lastSaveTime) {
        let elapsedTime = now.getTime() - lastSaveTime.getTime();
        let elapsedTimeInSeconds = Math.floor(elapsedTime / 1000);
        return Math.min(elapsedTimeInSeconds, MAX_ELAPSED_TIME_IN_SECONDS);
    }
    return 0;
}

function getXP(context: vscode.ExtensionContext) {
    return context.globalState.get<number>('totalXP') || DEFAULT_XP;
}

function initializeStatusBar(context: vscode.ExtensionContext) {
    let totalXP = getXP(context);
    updateStatusBar(totalXP);
}

function animateProgressBar(oldXP: number, newXP: number, steps: number = 100) {
    // Animate the progress bar from oldXP to newXP in the given number of steps using a sine curve.
    const frequency = .9; // Lower this number to widen the sine curve
    const baseDelay = 10; //delay flucuates between baseDelay and baseDelay + sinRange
    const sinRange = 3;

    steps = (newXP - oldXP) / 17; 
    let xpPerStep = (newXP - oldXP) / steps;
    let currentXP = oldXP;

    for (let i = 0; i < steps; i++) {
        let ratio = i / steps;
        let delay = baseDelay - sinRange * Math.sin(Math.PI * ratio * frequency);

        setTimeout(() => {
            currentXP += xpPerStep;
            updateStatusBar(currentXP);
        }, i * delay);
    }
}

function updateStatusBar(currentXP: number) {
    let level = calculateLevel(currentXP);
    let xpForLevel = calculateXPforLevel(level + 1);
    let xpProgressToNextLevel = currentXP - calculateTotalXP(level);
    let progressBar = createProgressBar(xpProgressToNextLevel, xpForLevel, 10);

    statusBar.text = `Lvl ${level}: ${progressBar}`;
}

function deactivate() {}

function calculateXPforLevel(level: number): number {
    //calculate the additional XP needed to reach given level
    return 1000 + (level-1) * 100;
}

function calculateTotalXP(level: number): number {
    //calculate the total XP needed to reach given level
    return 1000 * level + 100 * level * (level - 1) / 2;
}

function calculateLevel(totalXP: number): number {
    //calculate the level given the total XP using quadratic formula
    var n = (-950 + Math.sqrt(950 * 950 + 200*totalXP))/100;
    return Math.floor(n);
}

function createProgressBar(current: number, total: number, barSize: number = 10): string {
    current = Math.max(current, 0); // ensure current is at least 0
    current = Math.min(current, total); // ensure current does not exceed total

    let percentage = current / total;
    let progress = Math.floor(percentage * barSize);

    // An array of the icon names in the order that they should appear.
    let icons = ['progress-4', 'progress-5', 'progress-6', 'progress-7', 'progress-8', 'progress-9', 'progress-10', 'progress-11', 'progress-12', 'progress-14', 'progress-13'];

    // Initialize the progress bar with the beginning icon.
    let progressBar = '$(progress-beginning)';

    // Add the current progress icons.
    for (let i = 0; i < progress; i++) {
        progressBar += `$(progress-15)`;
    }

    // If progress is less than barSize, add the appropriate icon from the icons array.
    if (progress < barSize) {
        // Calculate the fraction of the progress.
        let fraction = (percentage * barSize) % 1;
        let iconIndex = Math.floor(fraction * (icons.length - 1));
        
        // Add the icon for the current progress.
        progressBar += `$(${icons[iconIndex]})`;
        let isNearEnd = progress === barSize - 1;
        
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

    // Add the end icon.
    progressBar += '$(progress-end-1)';

    return progressBar;
}