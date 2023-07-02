import * as vscode from 'vscode';

let statusBar: vscode.StatusBarItem;
let lastSaveTime: Date | undefined;

export function activate(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();

    context.subscriptions.push(statusBar);

    context.subscriptions.push(vscode.commands.registerCommand('codexp.addXP', async () => {
        let totalXP = context.globalState.get<number>('totalXP') || 0;
        
        // Prompt the user to enter the amount of XP to add.
        let xpToAdd = await vscode.window.showInputBox({ prompt: 'Enter the amount of XP to add:' });

        if (xpToAdd !== undefined) {
            totalXP += parseInt(xpToAdd);

            // Store the updated XP back to globalState
            context.globalState.update('totalXP', totalXP);

            updateStatusBar(totalXP);
        }
    }));
    
    lastSaveTime = new Date();

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
        let now = new Date();
        
        if (lastSaveTime) {
            let elapsedTime = now.getTime() - lastSaveTime.getTime();
            let elapsedTimeInSeconds = Math.floor(elapsedTime / 1000);
            elapsedTimeInSeconds = Math.min(elapsedTimeInSeconds, 5 * 60); // cap to 5 minutes

            // Get the total XP from globalState. If it's not set yet, default to 0
            let totalXP = context.globalState.get<number>('totalXP') || 0;
            totalXP += elapsedTimeInSeconds;

            // Store the updated XP back to globalState
            context.globalState.update('totalXP', totalXP);

            updateStatusBar(totalXP);  // Update the status bar when a document is saved
        }
        
        lastSaveTime = now;
    }));

    // Update the status bar when the extension is activated
    let totalXP = context.globalState.get<number>('totalXP') || 0;
    updateStatusBar(totalXP);

    context.subscriptions.push(vscode.commands.registerCommand('codexp.showInfo', () => {
        let totalXP = context.globalState.get<number>('totalXP') || 0;
        let level = calculateLevel(totalXP);
        let xpNeededForNextLevel = calculateXPNeededForNextLevel(level);
        let xpProgressToNextLevel = calculateRemainingXP(totalXP);
        vscode.window.showInformationMessage(`You are level ${level}. Total XP: ${xpProgressToNextLevel}. XP needed for next level: ${xpNeededForNextLevel}`);
    }));
}

function updateStatusBar(totalXP: number) {
    let level = calculateLevel(totalXP);
    let xpNeededForNextLevel = calculateXPNeededForNextLevel(level);
    let xpProgressToNextLevel = totalXP - calculateXPNeededForNextLevel(level);
    let progressBar = createProgressBar(xpProgressToNextLevel, xpNeededForNextLevel, 10);

    statusBar.text = `Lvl ${level}: ${progressBar}`;
}

function deactivate() {}

function calculateLevel(totalXP: number): number {
    const a = 100;
    const b = 1000;
    const c = -totalXP;
  
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return 0;
    }
  
    const level = Math.floor((-b + Math.sqrt(discriminant)) / (2 * a));
    return level;
}

function calculateXPNeededForNextLevel(level: number): number {
	if (level <= -1){return 0;};
    return 1000 + (level * 100);
}

function calculateRemainingXP(totalXP: number): number {
    let currentLevel = calculateLevel(totalXP);
    let nextLevelXP = calculateXPNeededForNextLevel(currentLevel + 1);

    return nextLevelXP - totalXP;
}

function createProgressBar(current: number, total: number, barSize: number = 10): string {
    current = Math.max(current, 0); // ensure current is at least 0
    current = Math.min(current, total); // ensure current does not exceed total

    let percentage = current / total;
    let progress = Math.round(percentage * barSize);

    // An array of the icon names in the order that they should appear.
    let icons = ['progress-3', 'progress-4', 'progress-5', 'progress-6', 'progress-7', 'progress-8', 'progress-9', 'progress-10', 'progress-11', 'progress-12'];

    // Initialize the progress bar with the beginning icon.
    let progressBar = '$(progress-beginning)';

    // Add the current progress icons.
    for (let i = 0; i < progress; i++) {
        progressBar += `$(progress-15)`;
    }

    // If progress is less than barSize, add the appropriate icon from the icons array.
    if (progress < barSize) {
        progressBar += `$(${icons[Math.floor((percentage % 0.1) * 10)]})`;
    }

    // Add the remaining empty space.
    for (let i = progress + 1; i < barSize; i++) {
        progressBar += '$(progress-1)';
    }

    // Add the end icon.
    progressBar += '$(progress-end-1)';

    return progressBar;
}