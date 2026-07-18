const fs = require('fs');
let appJsx = fs.readFileSync('frontend/src/App.jsx', 'utf8');

appJsx = appJsx.replace(
`  return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {`,
`  useEffect(() => {`
);

fs.writeFileSync('frontend/src/App.jsx', appJsx);
