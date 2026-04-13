const fs = require('fs');
function fixPortal(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('createPortal')) {
        content = content.replace(
            "import React from 'react';",
            "import React from 'react';\nimport { createPortal } from 'react-dom';"
        );
    }
    
    content = content.replace(
        "      {nativePushPermissionPromptOpen ? (\n        <div className=\"flbp-mobile-sheet fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm\">\n",
        "      {nativePushPermissionPromptOpen && typeof document !== 'undefined' ? createPortal(\n        <div className=\"flbp-mobile-sheet fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm\">\n"
    );
    
    content = content.replace(
        "          </div>\n        </div>\n      ) : null}\n      <div className={cardClass}>",
        "          </div>\n        </div>\n      ), document.body) : null}\n      <div className={cardClass}>"
    );

    fs.writeFileSync(filePath, content);
    console.log("Portal fix applied to " + filePath);
}

fixPortal('FLBP ONLINE/components/PlayerArea.tsx');
fixPortal('FLBP LOCALE/components/PlayerArea.tsx');
