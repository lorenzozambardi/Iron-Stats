import fs from 'fs';
import postcss from 'postcss';

const cssPath = 'src/index.css';
const css = fs.readFileSync(cssPath, 'utf-8');

const plugin = postcss.plugin('wrap-hover', () => {
  return (root) => {
    const rulesToWrap = [];
    
    root.walkRules((rule) => {
      // Check if the rule contains :hover
      if (rule.selector.includes(':hover')) {
        // Ensure it's not already inside a @media (hover: hover)
        let isWrapped = false;
        let parent = rule.parent;
        while (parent && parent.type !== 'root') {
          if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes('hover: hover')) {
            isWrapped = true;
            break;
          }
          parent = parent.parent;
        }
        
        if (!isWrapped) {
          rulesToWrap.push(rule);
        }
      }
    });

    // We process them backwards or create wrappers in place
    // Actually we can create a new AtRule and replace the rule
    rulesToWrap.forEach(rule => {
      const wrapper = postcss.atRule({
        name: 'media',
        params: '(hover: hover) and (pointer: fine)'
      });
      // We need to keep the original indentation and newlines if possible
      wrapper.source = rule.source;
      rule.replaceWith(wrapper);
      wrapper.append(rule);
    });
  };
});

postcss([plugin]).process(css, { from: cssPath, to: cssPath }).then(result => {
  fs.writeFileSync(cssPath, result.css);
  console.log('Successfully wrapped all :hover rules in @media (hover: hover)');
}).catch(err => {
  console.error('Error:', err);
});
