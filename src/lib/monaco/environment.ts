import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Monaco reads one global environment. Every editor imports this module instead of a copy.
self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string) {
		if (label === 'json') {
			return new jsonWorker();
		}

		return new editorWorker();
	}
};
