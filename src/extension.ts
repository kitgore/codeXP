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
        let xpForLevel = calculateXPforLevel(level + 1);
        let xpProgressToNextLevel = totalXP - calculateTotalXP(level);
        let xpNeededForNextLevel = xpForLevel - xpProgressToNextLevel;
        vscode.window.showInformationMessage(`You are level ${level}. XP: ${xpProgressToNextLevel}. XP needed for next level: ${xpNeededForNextLevel}`);
    }));
}

function updateStatusBar(totalXP: number) {
    let level = calculateLevel(totalXP);
    let xpForLevel = calculateXPforLevel(level + 1);
    let xpProgressToNextLevel = totalXP - calculateTotalXP(level);
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
    let icons = ['progress-3', 'progress-4', 'progress-5', 'progress-6', 'progress-7', 'progress-8', 'progress-9', 'progress-10', 'progress-11', 'progress-12', 'progress-13', 'progress-14'];

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
        let iconIndex = Math.floor(fraction * icons.length);
        
        // Add the icon for the current progress.
        progressBar += `$(${icons[iconIndex]})`;
        let isNearEnd = progress === barSize - 1;
        
        // Check if icon runs over into the next icon
        if (iconIndex >= icons.length - 3 && iconIndex <= icons.length - 2) {
            
            // Determine the type of icon to add based on the current progress.
            let progressIconType = isNearEnd ? `progress-end-${icons.length - iconIndex + 1}` : `progress-${icons.length - iconIndex + 1}`;
            
            // Add the determined icon to the progress bar.
            progressBar += `$(${progressIconType})`;
            
            // If at end of progress bar, return the progress bar, else increment progress.
            if (isNearEnd) {
                return progressBar;
            }
            progress++;
        }

        //Full progress bar icon
        if (isNearEnd) {
            progressBar += '$(progress-end-4)';
            return progressBar;
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