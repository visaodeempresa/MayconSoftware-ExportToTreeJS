package com.mayconsoftware.sweethome3d.plugin.exporttothreejs;

import com.eteks.sweethome3d.plugin.Plugin;
import com.eteks.sweethome3d.plugin.PluginAction;

public class ExportToThreeJSPlugin extends Plugin {
    @Override
    public PluginAction[] getActions() {
        return new PluginAction[] {
            new ExportToThreeJSAction(this)
        };
    }
}
