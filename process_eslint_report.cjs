const fs = require('fs');

try {
	const reportContent = fs.readFileSync('eslint_report.json', 'utf-8');
	const report = JSON.parse(reportContent);

	const engineErrors = [];
	const allErrorsAndWarnings = [];
	let count = 0;

	for (const fileResult of report) {
		if (fileResult.filePath.includes('src/engine/')) {
			for (const message of fileResult.messages) {
				engineErrors.push({
					filePath: fileResult.filePath,
					line: message.line,
					column: message.column,
					severity: message.severity === 2 ? 'error' : 'warning',
					ruleId: message.ruleId,
					message: message.message
				});
			}
		}
		// Collect all errors and warnings for fallback
		for (const message of fileResult.messages) {
			if (count < 20) {
				// Limit to first 20 for the fallback
				allErrorsAndWarnings.push({
					filePath: fileResult.filePath,
					line: message.line,
					column: message.column,
					severity: message.severity === 2 ? 'error' : 'warning',
					ruleId: message.ruleId,
					message: message.message
				});
				count++;
			}
		}
	}

	if (engineErrors.length > 0) {
		console.log('ESLint issues in src/engine/:');
		engineErrors.forEach((e) => {
			console.log(
				`- ${e.filePath}:${e.line}:${e.column} [${e.severity}] (${e.ruleId || 'unknown'}): ${e.message}`
			);
		});
	} else if (allErrorsAndWarnings.length > 0) {
		console.log(
			'No ESLint issues found in src/engine/. Displaying first ' +
				allErrorsAndWarnings.length +
				' issues from the project:'
		);
		allErrorsAndWarnings.forEach((e) => {
			console.log(
				`- ${e.filePath}:${e.line}:${e.column} [${e.severity}] (${e.ruleId || 'unknown'}): ${e.message}`
			);
		});
	} else {
		console.log('No ESLint issues found in the project.');
	}
} catch (err) {
	console.error('Error processing ESLint report:', err);
	// If parsing or file reading fails, output the raw content for debugging if necessary,
	// or a more specific error.
	// For now, just log the error.
}
