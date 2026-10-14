define([], function () {
  'use strict';

  return function ElearSalesBrainWidget() {
    this.callbacks = {
      init: function () { return true; },
      render: function () { return true; },
      bind_actions: function () { return true; },
      settings: function () { return true; },

      onSalesbotDesignerSave: function (_handlerCode, params) {
        var endpoint = params && params.endpoint;
        if (!endpoint) {
          return JSON.stringify([]);
        }

        return JSON.stringify([
          {
            question: [
              {
                handler: 'widget_request',
                params: {
                  url: endpoint,
                  data: {
                    message: '{{message_text}}',
                    lead_id: '{{lead.id}}',
                    contact_name: '{{contact.name}}',
                    source: 'elear-sales-brain-test'
                  }
                }
              }
            ],
            require: []
          }
        ]);
      },

      destroy: function () {}
    };

    return this;
  };
});
