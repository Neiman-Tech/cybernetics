import React, { useState } from 'react';
import { useProject } from '../../../contexts/ProjectContext';
import './Search.css';

const Search = () => {
  const { files } = useProject();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    const searchResults = files.filter(file => 
      file.type !== 'folder' && 
      file.content?.toLowerCase().includes(searchTerm.toLowerCase())
    ).map(file => {
      const lines = file.content.split('\n');
      const matches = lines
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => line.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return {
        file,
        matches: matches.slice(0, 5) // Limit to 5 matches per file
      };
    });

    setResults(searchResults);
  };

  return (
    <div className="search-view">
      <div className="search-header">
        <h3>Search</h3>
      </div>
      
      <div className="search-input-container">
        <input
          type="text"
          placeholder="Search in files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="search-input"
        />
        <button onClick={handleSearch} className="search-button">
          Search
        </button>
      </div>

      <div className="search-results">
        {results.length === 0 && searchTerm && (
          <div className="no-results">No results found</div>
        )}
        
        {results.map(({ file, matches }) => (
          <div key={file._id} className="search-result-file">
            <div className="result-file-name">{file.path}</div>
            {matches.map(({ line, lineNumber }) => (
              <div key={lineNumber} className="result-line">
                <span className="line-number">{lineNumber}</span>
                <span className="line-content">{line}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Search;