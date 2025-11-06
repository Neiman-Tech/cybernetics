import React, { useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../../contexts/ThemeContext';
import { useProject } from '../../contexts/ProjectContext';
import { detectLanguage } from '../../utils/languageDetector';
import './CodeEditor.css';

const CodeEditor = ({ file }) => {
  const { theme } = useTheme();
  const { updateFileContent, updateFile } = useProject();
  const editorRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const language = detectLanguage(file.path);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add save keybinding (Ctrl+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    // Focus editor
    editor.focus();
  };

  const handleChange = useCallback((value) => {
    if (value !== undefined) {
      updateFileContent(file._id, value);

      // Auto-save after 1 second of no typing
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        handleSave(value);
      }, 1000);
    }
  }, [file._id, updateFileContent]);

  const handleSave = useCallback((content) => {
    const contentToSave = content || editorRef.current?.getValue() || file.content;
    updateFile(file._id, contentToSave);
  }, [file._id, file.content, updateFile]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="code-editor">
      <Editor
        height="100%"
        language={language}
        value={file.content || ''}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          fontSize: 16, // Increased from 14 to 16
          fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          formatOnPaste: true,
          formatOnType: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          padding: { top: 16, bottom: 16 },
          lineHeight: 24, // Added for better readability with larger font
        }}
      />
    </div>
  );
};

export default CodeEditor;