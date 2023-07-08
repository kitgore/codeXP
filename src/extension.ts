import * as vscode from 'vscode';

let statusBar: vscode.StatusBarItem;
let lastSaveTime: Date | undefined;

const DEFAULT_XP = 0;
const MAX_ELAPSED_TIME_IN_SECONDS = 5 * 60; // cap to 5 minutes

export function activate(context: vscode.ExtensionContext) {
    setupStatusBar(context);
    listenForXPAddCommand(context);
    listenForDocumentSave(context);
    showTotalXPonActivation(context);
    listenForShowInfoCommand(context);
    setLastSaveDate(context, new Date(2023, 6, 6));
}

function setupStatusBar(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

function listenForXPAddCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('codexp.addXP', async () => {
        let oldXP = getXP(context);
        let xpToAdd = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to add:' });

        if (xpToAdd !== undefined) {
            let newXP = oldXP + parseInt(xpToAdd);
            context.globalState.update('totalXP', newXP);
            animateProgressBar(oldXP, newXP, newXP);
        }
    }));
}

function setLastSaveDate(context: vscode.ExtensionContext, date: Date) {
    context.globalState.update('lastSaveDate', date);
}

function listenForDocumentSave(context: vscode.ExtensionContext) {
    lastSaveTime = new Date();
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
        let now = new Date();
        let lastSaveDate = context.globalState.get<Date>('lastSaveDate');
        console.log("last save date" + lastSaveDate);
        console.log("now" + now);
        // let lastSaveDate = new Date();
        let oldXP = getXP(context);
        let newXP = oldXP + getElapsedTimeInSeconds();

        if (isNewDay(now, lastSaveDate)) {
            newXP += 1000;  // Apply daily bonus
            context.globalState.update('lastSaveDate', now);  // Update the last save date
        }

        context.globalState.update('totalXP', newXP);
        animateProgressBar(oldXP, newXP, newXP);
        lastSaveTime = now;
    }));
}

function isNewDay(currentDate: Date, lastSaveDate: Date | undefined): boolean {
    if (!lastSaveDate) {
        return true;  // This is the first save, so it's a new day
    }

    return currentDate.getDate() !== lastSaveDate.getDate() ||
           currentDate.getMonth() !== lastSaveDate.getMonth() ||
           currentDate.getFullYear() !== lastSaveDate.getFullYear();
}

function getElapsedTimeInSeconds() {
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

function showTotalXPonActivation(context: vscode.ExtensionContext) {
    let totalXP = getXP(context);
    updateStatusBar(totalXP, totalXP);
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

function animateProgressBar(oldXP: number, newXP: number, totalXP: number, steps: number = 100) {
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
            updateStatusBar(currentXP, totalXP);
        }, i * delay);
    }
}

function updateStatusBar(currentXP: number, totalXP: number) {
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