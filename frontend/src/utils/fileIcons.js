import React from 'react';
import {
  SiJavascript,
  SiTypescript,
  SiPython,
  SiHtml5,
  SiCss3,
  SiJson,
  SiMarkdown,
  SiReact,
  SiVuedotjs,
  SiAngular,
  SiNodedotjs,
  SiDocker,
  SiGit,
  SiYaml,
  SiPhp,
  SiRuby,
  SiGo,
  SiRust,
  SiCplusplus,
  SiC,
  SiOpenjdk,      // <- use OpenJDK icon instead of SiJava (SiJava doesn't exist)
  SiSwift,
  SiKotlin,
  SiShell
} from 'react-icons/si';

import {
  AiFillFile,
  AiFillFolder,
  AiFillFolderOpen,
  AiOutlineFileImage,
  AiOutlineFilePdf,
  AiOutlineFileZip
} from 'react-icons/ai';

import { VscJson } from 'react-icons/vsc';
import { DiNpm } from 'react-icons/di';

const iconMap = {
  // JavaScript/TypeScript
  'js': { icon: SiJavascript, color: '#F7DF1E' },
  'jsx': { icon: SiReact, color: '#61DAFB' },
  'ts': { icon: SiTypescript, color: '#3178C6' },
  'tsx': { icon: SiReact, color: '#61DAFB' },
  'mjs': { icon: SiJavascript, color: '#F7DF1E' },
  'cjs': { icon: SiJavascript, color: '#F7DF1E' },

  // Python
  'py': { icon: SiPython, color: '#3776AB' },
  'pyc': { icon: SiPython, color: '#3776AB' },
  'pyd': { icon: SiPython, color: '#3776AB' },
  'pyw': { icon: SiPython, color: '#3776AB' },

  // Web
  'html': { icon: SiHtml5, color: '#E34F26' },
  'htm': { icon: SiHtml5, color: '#E34F26' },
  'css': { icon: SiCss3, color: '#1572B6' },
  'scss': { icon: SiCss3, color: '#CC6699' },
  'sass': { icon: SiCss3, color: '#CC6699' },
  'less': { icon: SiCss3, color: '#1D365D' },

  // Data
  'json': { icon: VscJson, color: '#5382A1' },
  'yaml': { icon: SiYaml, color: '#CB171E' },
  'yml': { icon: SiYaml, color: '#CB171E' },
  'xml': { icon: AiFillFile, color: '#E34F26' },
  'toml': { icon: AiFillFile, color: '#9C4121' },

  // Markdown
  'md': { icon: SiMarkdown, color: '#000000' },
  'mdx': { icon: SiMarkdown, color: '#000000' },
  'markdown': { icon: SiMarkdown, color: '#000000' },

  // Frameworks
  'vue': { icon: SiVuedotjs, color: '#4FC08D' },
  'angular': { icon: SiAngular, color: '#DD0031' },

  // Backend
  'php': { icon: SiPhp, color: '#777BB4' },
  'rb': { icon: SiRuby, color: '#CC342D' },
  'go': { icon: SiGo, color: '#00ADD8' },
  'rs': { icon: SiRust, color: '#000000' },

  // Systems
  'c': { icon: SiC, color: '#A8B9CC' },
  'cpp': { icon: SiCplusplus, color: '#00599C' },
  'cc': { icon: SiCplusplus, color: '#00599C' },
  'h': { icon: SiC, color: '#A8B9CC' },
  'hpp': { icon: SiCplusplus, color: '#00599C' },
  'java': { icon: SiOpenjdk, color: '#007396' }, // <- fixed to SiOpenjdk
  'kt': { icon: SiKotlin, color: '#7F52FF' },
  'swift': { icon: SiSwift, color: '#FA7343' },

  // Shell
  'sh': { icon: SiShell, color: '#89E051' },
  'bash': { icon: SiShell, color: '#89E051' },
  'zsh': { icon: SiShell, color: '#89E051' },
  'fish': { icon: SiShell, color: '#89E051' },

  // Config
  'env': { icon: AiFillFile, color: '#ECD53F' },
  'config': { icon: AiFillFile, color: '#6D6D6D' },
  'conf': { icon: AiFillFile, color: '#6D6D6D' },
  'ini': { icon: AiFillFile, color: '#6D6D6D' },

  // Docker
  'dockerfile': { icon: SiDocker, color: '#2496ED' },
  'dockerignore': { icon: SiDocker, color: '#2496ED' },

  // Git
  'gitignore': { icon: SiGit, color: '#F05032' },
  'gitattributes': { icon: SiGit, color: '#F05032' },

  // Package managers
  'package.json': { icon: DiNpm, color: '#CB3837' },
  'package-lock.json': { icon: DiNpm, color: '#CB3837' },

  // Images
  'png': { icon: AiOutlineFileImage, color: '#4CAF50' },
  'jpg': { icon: AiOutlineFileImage, color: '#4CAF50' },
  'jpeg': { icon: AiOutlineFileImage, color: '#4CAF50' },
  'gif': { icon: AiOutlineFileImage, color: '#4CAF50' },
  'svg': { icon: AiOutlineFileImage, color: '#FFB13B' },
  'ico': { icon: AiOutlineFileImage, color: '#4CAF50' },
  'webp': { icon: AiOutlineFileImage, color: '#4CAF50' },

  // Documents
  'pdf': { icon: AiOutlineFilePdf, color: '#F40F02' },
  'doc': { icon: AiFillFile, color: '#2B579A' },
  'docx': { icon: AiFillFile, color: '#2B579A' },

  // Archives
  'zip': { icon: AiOutlineFileZip, color: '#FFA000' },
  'tar': { icon: AiOutlineFileZip, color: '#FFA000' },
  'gz': { icon: AiOutlineFileZip, color: '#FFA000' },
  'rar': { icon: AiOutlineFileZip, color: '#FFA000' },

  // Folders
  'folder': { icon: AiFillFolder, color: '#90A4AE' },
  'folder-open': { icon: AiFillFolderOpen, color: '#90A4AE' },
};

export const getFileIcon = (fileName, isOpen = false) => {
  if (!fileName) return { icon: AiFillFile, color: '#90A4AE' };

  // Check if it's a folder
  if (fileName === 'folder') {
    return isOpen
      ? { icon: AiFillFolderOpen, color: '#90A4AE' }
      : { icon: AiFillFolder, color: '#90A4AE' };
  }

  // Special file names (exact match)
  const lowerName = fileName.toLowerCase();
  if (iconMap[lowerName]) {
    return iconMap[lowerName];
  }

  // Check extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && iconMap[ext]) {
    return iconMap[ext];
  }

  // Default
  return { icon: AiFillFile, color: '#90A4AE' };
};

export const FileIcon = ({ fileName, isOpen, size = 16, style = {} }) => {
  const { icon: Icon, color } = getFileIcon(fileName, isOpen);
  return <Icon size={size} color={color} style={style} />;
};
