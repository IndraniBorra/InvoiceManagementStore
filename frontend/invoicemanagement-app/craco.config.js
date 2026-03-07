module.exports = {
  devServer: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Configure webpack for transformers.js
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "fs": false,
        "path": false,
      };
      
      // Handle WASM files
      webpackConfig.experiments = {
        ...webpackConfig.experiments,
        asyncWebAssembly: true,
      };
      
      return webpackConfig;
    },
  },
};