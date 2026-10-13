(function () {
  'use strict';

  function json(value) {
    return JSON.stringify(value);
  }

  window.onSalesbotDesignerSave = function (_handlerCode, params) {
    var endpoint = params && params.endpoint ? params.endpoint : '';
    return json([{
      question: [{
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
      }, {
        handler: 'conditions',
        conditions: [{
          term1: '{{json.status}}',
          term2: 'success',
          operation: '='
        }],
        result: [{ handler: 'exits', params: { value: 'success' } }]
      }, {
        handler: 'exits',
        params: { value: 'fail' }
      }]
    }]);
  };
})();
