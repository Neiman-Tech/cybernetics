// Maps file extensions to Monaco Editor language identifiers
const extensionToLanguage = {
  // JavaScript/TypeScript
  'js': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  
  // Web
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'scss',
  'less': 'less',
  
  // Data
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'xml': 'xml',
  'toml': 'ini',
  
  // Markdown
  'md': 'markdown',
  'mdx': 'markdown',
  'markdown': 'markdown',
  
  // Python
  'py': 'python',
  
  // Backend
  'php': 'php',
  'rb': 'ruby',
  'go': 'go',
  'rs': 'rust',
  
  // Systems
  'c': 'c',
  'cpp': 'cpp',
  'cc': 'cpp',
  'h': 'c',
  'hpp': 'cpp',
  'java': 'java',
  'kt': 'kotlin',
  'swift': 'swift',
  'cs': 'csharp',
  
  // Shell
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'fish': 'shell',
  
  // Config
  'env': 'shell',
  'config': 'ini',
  'conf': 'ini',
  'ini': 'ini',
  
  // Docker
  'dockerfile': 'dockerfile',
  
  // SQL
  'sql': 'sql',
  
  // Others
  'txt': 'plaintext',
  'log': 'plaintext',
  'gitignore': 'plaintext',
  'dockerignore': 'plaintext',
  'gitattributes': 'plaintext',
};

export const detectLanguage = (fileName) => {
  if (!fileName) return 'plaintext';
  
  // Special file names
  const lowerName = fileName.toLowerCase();
  if (lowerName === 'dockerfile') return 'dockerfile';
  if (lowerName === 'makefile') return 'makefile';
  if (lowerName === 'package.json') return 'json';
  if (lowerName === 'tsconfig.json') return 'json';
  if (lowerName === '.gitignore') return 'plaintext';
  if (lowerName === '.dockerignore') return 'plaintext';
  if (lowerName === '.env') return 'shell';
  
  // Get extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  return extensionToLanguage[ext] || 'plaintext';
};
