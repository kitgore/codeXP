import * as vscode from 'vscode';

let statusBar: vscode.StatusBarItem;
let lastSaveTime: Date | undefined;

export function activate(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.command = 'codexp.showInfo';
    statusBar.show();

    context.subscriptions.push(statusBar);
    
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
        vscode.window.showInformationMessage(`You are level ${level}. Total XP: ${totalXP}. XP needed for next level: ${xpNeededForNextLevel}`);
    }));
}

function updateStatusBar(totalXP: number) {
    let level = calculateLevel(totalXP);
    let xpNeededForNextLevel = calculateXPNeededForNextLevel(level);
    let xpProgressToNextLevel = totalXP - calculateXPNeededForNextLevel(level - 1);
    let progressBar = createProgressBar(xpProgressToNextLevel, xpNeededForNextLevel);

    statusBar.text = `Level ${level}: ${progressBar}`;
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

function createProgressBar(current: number, total: number, barSize: number = 20): string {
    current = Math.max(current, 0); // ensure current is at least 0
    let percentage = current / total;
    let progress = Math.round(percentage * barSize);
    return '[' + '='.repeat(progress) + '-'.repeat(barSize - progress) + ']';
}