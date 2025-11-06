import React, { useState, useMemo } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { FileIcon } from '../../utils/fileIcons';
import { VscChevronRight, VscChevronDown, VscTrash } from 'react-icons/vsc';
import './FileTree.css';

const FileTree = ({ files }) => {
  const { openFile, deleteFile } = useProject();
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  const fileTree = useMemo(() => {
    const tree = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            type: index === parts.length - 1 ? file.type : 'folder',
            file: index === parts.length - 1 ? file : null,
            children: {}
          };
        }
        current = current[part].children;
      });
    });
    
    return tree;
  }, [files]);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDelete = async (e, file) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete ${file.path}?`)) {
      try {
        await deleteFile(file._id);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
  };

  const renderNode = (node, level = 0) => {
    const isFolder = node.type === 'folder';
    const isExpanded = expandedFolders.has(node.path);
    const hasChildren = Object.keys(node.children).length > 0;

    return (
      <div key={node.path} className="tree-node">
        <div
          className="tree-item"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.path);
            } else if (node.file) {
              openFile(node.file);
            }
          }}
        >
          {isFolder && (
            <span className="tree-chevron">
              {isExpanded ? <VscChevronDown size={16} /> : <VscChevronRight size={16} />}
            </span>
          )}
          
          <FileIcon 
            fileName={isFolder ? 'folder' : node.name}
            isOpen={isExpanded}
            size={16}
          />
          
          <span className="tree-label">{node.name}</span>
          
          {node.file && (
            <button
              className="delete-button"
              onClick={(e) => handleDelete(e, node.file)}
              title="Delete"
            >
              <VscTrash size={14} />
            </button>
          )}
        </div>
        
        {isFolder && isExpanded && hasChildren && (
          <div className="tree-children">
            {Object.values(node.children).map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree">
      {Object.values(fileTree).map(node => renderNode(node))}
    </div>
  );
};

export default FileTree;