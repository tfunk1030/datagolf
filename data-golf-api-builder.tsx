import React, { useState } from 'react';
import { Copy, Play, Settings } from 'lucide-react';

const DataGolfAPIBuilder = () => {
  const [apiKey, setApiKey] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [parameters, setParameters] = useState({});
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const apiCategories = {
    'general': {
      name: 'General Use',
      description: 'Updated field lists, tee times, DFS salaries',
      endpoints: {
        'field-updates': {
          name: 'Field Updates',
          params: ['tour', 'year'],
          baseUrl: 'https://feeds.datagolf.com/field-updates'
        },
        'tee-times': {
          name: 'Tee Times',
          params: ['tour', 'year', 'event_id'],
          baseUrl: 'https://feeds.datagolf.com/tee-times'
        },
        'dfs-salaries': {
          name: 'DFS Salaries',
          params: ['tour', 'year', 'event_id', 'site'],
          baseUrl: 'https://feeds.datagolf.com/dfs-salaries'
        }
      }
    },
    'predictions': {
      name: 'Model Predictions',
      description: 'Historical, pre-tournament, and live predictions',
      endpoints: {
        'pre-tournament': {
          name: 'Pre-Tournament Predictions',
          params: ['tour', 'add_position', 'dead_heat', 'odds_format', 'file_format'],
          baseUrl: 'https://feeds.datagolf.com/preds/pre-tournament',
          paramOptions: {
            tour: ['pga', 'euro', 'kft', 'opp', 'alt'],
            dead_heat: ['yes', 'no'],
            odds_format: ['percent', 'american', 'decimal', 'fraction'],
            file_format: ['json', 'csv']
          },
          paramDefaults: {
            tour: 'pga',
            dead_heat: 'yes',
            odds_format: 'percent',
            file_format: 'json'
          }
        },
        'live-preds': {
          name: 'Live Predictions',
          params: ['tour', 'year', 'event_id', 'round'],
          baseUrl: 'https://feeds.datagolf.com/live-preds'
        },
        'historical-preds': {
          name: 'Historical Predictions',
          params: ['tour', 'year', 'event_id'],
          baseUrl: 'https://feeds.datagolf.com/historical-preds'
        }
      }
    },
    'betting': {
      name: 'Betting Tools',
      description: 'Live odds data from betting tools',
      endpoints: {
        'live-odds': {
          name: 'Live Outright Odds',
          params: ['tour', 'market', 'odds_format'],
          baseUrl: 'https://feeds.datagolf.com/live-odds'
        },
        'matchup-odds': {
          name: 'Matchup & 3-Ball Odds',
          params: ['tour', 'market_type'],
          baseUrl: 'https://feeds.datagolf.com/matchup-odds'
        }
      }
    },
    'historical-raw': {
      name: 'Historical Raw Data',
      description: 'Round-level scoring, stats, strokes-gained data',
      endpoints: {
        'scoring': {
          name: 'Round Scoring',
          params: ['tour', 'year', 'event_id', 'round'],
          baseUrl: 'https://feeds.datagolf.com/scoring'
        },
        'stats': {
          name: 'Player Stats',
          params: ['tour', 'year', 'stat_category'],
          baseUrl: 'https://feeds.datagolf.com/stats'
        },
        'strokes-gained': {
          name: 'Strokes Gained',
          params: ['tour', 'year', 'event_id', 'category'],
          baseUrl: 'https://feeds.datagolf.com/strokes-gained'
        }
      }
    },
    'historical-odds': {
      name: 'Historical Odds',
      description: 'Historical opening/closing lines from sportsbooks',
      endpoints: {
        'historical-odds': {
          name: 'Tournament Odds History',
          params: ['tour', 'year', 'event_id', 'market', 'sportsbook'],
          baseUrl: 'https://feeds.datagolf.com/historical-odds'
        }
      }
    },
    'dfs-historical': {
      name: 'Historical DFS Data',
      description: 'Historical fantasy points from DraftKings/FanDuel',
      endpoints: {
        'dfs-points': {
          name: 'DFS Points History',
          params: ['tour', 'year', 'event_id', 'site'],
          baseUrl: 'https://feeds.datagolf.com/dfs-points'
        }
      }
    }
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setSelectedEndpoint('');
    setParameters({});
    setGeneratedUrl('');
    setResponse(null);
  };

  const handleEndpointChange = (endpoint) => {
    setSelectedEndpoint(endpoint);
    setParameters({});
    setGeneratedUrl('');
    setResponse(null);
  };

  const handleParameterChange = (param, value) => {
    setParameters(prev => ({
      ...prev,
      [param]: value
    }));
  };

  const generateUrl = () => {
    if (!selectedCategory || !selectedEndpoint || !apiKey) return;

    const endpoint = apiCategories[selectedCategory].endpoints[selectedEndpoint];
    let url = endpoint.baseUrl;
    
    const params = new URLSearchParams();
    
    // Add parameters first, using defaults where available
    endpoint.params.forEach(param => {
      const value = parameters[param];
      const defaultValue = endpoint.paramDefaults && endpoint.paramDefaults[param];
      
      if (value && value.trim()) {
        params.append(param, value.trim());
      } else if (defaultValue && !parameters.hasOwnProperty(param)) {
        // Only add default if user hasn't touched the field
        params.append(param, defaultValue);
      }
    });
    
    // Add API key last
    params.append('key', apiKey);

    const finalUrl = `${url}?${params.toString()}`;
    setGeneratedUrl(finalUrl);
  };

  const testQuery = async () => {
    if (!generatedUrl) return;

    setLoading(true);
    try {
      const response = await fetch(generatedUrl);
      const data = await response.json();
      setResponse({
        status: response.status,
        data: data
      });
    } catch (error) {
      setResponse({
        status: 'CORS/Network Error',
        data: { 
          error: error.message,
          note: "This is likely a CORS error - the API doesn't allow direct browser requests. Copy the URL and test it in Postman, curl, or your backend code instead."
        }
      });
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedUrl);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Golf API Query Builder</h1>
        <p className="text-gray-600">Build and test API queries for the Data Golf API with an easy-to-use interface.</p>
      </div>

      {/* API Key Input */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Settings className="inline w-4 h-4 mr-1" />
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your Data Golf API key"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Select Category</label>
            <div className="space-y-2">
              {Object.entries(apiCategories).map(([key, category]) => (
                <div
                  key={key}
                  onClick={() => handleCategoryChange(key)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCategory === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{category.name}</div>
                  <div className="text-sm text-gray-500">{category.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Endpoint Selection */}
          {selectedCategory && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Select Endpoint</label>
              <div className="space-y-2">
                {Object.entries(apiCategories[selectedCategory].endpoints).map(([key, endpoint]) => (
                  <div
                    key={key}
                    onClick={() => handleEndpointChange(key)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedEndpoint === key
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{endpoint.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Parameters: {endpoint.params.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameters */}
          {selectedEndpoint && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Parameters</label>
              <div className="space-y-3">
                {apiCategories[selectedCategory].endpoints[selectedEndpoint].params.map((param) => {
                  const endpoint = apiCategories[selectedCategory].endpoints[selectedEndpoint];
                  const hasOptions = endpoint.paramOptions && endpoint.paramOptions[param];
                  const defaultValue = endpoint.paramDefaults && endpoint.paramDefaults[param];
                  
                  return (
                    <div key={param}>
                      <label className="block text-sm text-gray-600 mb-1">
                        {param}
                        {param === 'add_position' && (
                          <span className="text-xs text-gray-500 block">
                            Comma-separated list (e.g., "17,23"). Defaults: win, top 5, top 10, top 20, make cut
                          </span>
                        )}
                        {defaultValue && (
                          <span className="text-xs text-blue-500 ml-1">(default: {defaultValue})</span>
                        )}
                      </label>
                      {hasOptions ? (
                        <select
                          value={parameters[param] || defaultValue || ''}
                          onChange={(e) => handleParameterChange(param, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select {param}</option>
                          {endpoint.paramOptions[param].map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={parameters[param] || ''}
                          onChange={(e) => handleParameterChange(param, e.target.value)}
                          placeholder={
                            param === 'add_position' 
                              ? 'e.g., 17,23 (optional)'
                              : `Enter ${param}${defaultValue ? ' (optional)' : ''}`
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate Button */}
          {selectedEndpoint && apiKey && (
            <button
              onClick={generateUrl}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Generate API URL
            </button>
          )}
        </div>

        {/* Right Column - Output */}
        <div className="space-y-6">
          {/* Generated URL */}
          {generatedUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Generated API URL</label>
              <div className="relative">
                <textarea
                  value={generatedUrl}
                  readOnly
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
                />
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 p-1 text-gray-500 hover:text-gray-700"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mt-3 flex gap-2">
                <button
                  onClick={testQuery}
                  disabled={loading}
                  className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  <Play className="w-4 h-4 mr-1" />
                  {loading ? 'Testing...' : 'Test Query'}
                </button>
                <div className="text-sm text-gray-600 flex items-center">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                    Note: API testing may fail due to CORS. Copy URL for external testing.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* API Response */}
          {response && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">API Response</label>
              <div className="border rounded-md">
                <div className={`px-3 py-2 text-sm font-medium ${
                  response.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  Status: {response.status}
                </div>
                <div className="p-3 max-h-96 overflow-auto">
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataGolfAPIBuilder;