const roles = {
  admin:           'admin',
  supervisor:      'supervisor',
  manager:         'manager',
  company_manager: 'company_manager',
  operator:        'operator',
  sales_manager:   'sales_manager',
  sales:           'sales',
  carrier_manager: 'carrier_manager',
  client:          'client',
};

const rolesSubordinaries = {
  admin:           ['admin', 'supervisor', 'manager', 'company_manager', 'operator', 'sales_manager', 'sales', 'carrier_manager', 'client'],
  supervisor:      ['supervisor', 'manager', 'company_manager', 'operator', 'sales_manager', 'sales', 'carrier_manager', 'client'],
  manager:         ['manager', 'company_manager', 'operator', 'sales_manager', 'sales', 'client'],
  company_manager: ['company_manager', 'client'],
  operator:        ['operator', 'client'],
  sales_manager:   ['sales_manager', 'sales', 'client'],
  sales:           ['sales'],
  carrier_manager: ['carrier_manager'],
  client:          ['client'],
};

const serviceRoles = {
  guest: 'guest',
}

const perms = {
  [serviceRoles.guest]: [
    'acl:get',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',

    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',
    
    'messages:attachment_download',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'addresses:suggest',

    'countries:list',
    'countries:get',

    'regions:list',
    'regions:get',

    'rates:search',

    'yandex:estimate',
  ],

  [roles.admin]: [
    'menu:dashboard',
    'menu:orders',
    'menu:messages',
    'menu:companies',
    'menu:users',
    'menu:groups',
    'menu:carriers',
    'menu:geography',
    'menu:reports',
    'menu:sales',
    //'menu:pages',
    //'menu:news',
    'menu:access_log',
    'menu:config',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'access_log:list',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',
    'config:set',

    'package_types:list',

    'geo_data:list',

    'rate_types:list',

    'users:perms-all',
    'users:extended_view',
    'users:list_orders',
    'users:list',
    'users:get',
    'users:add',
    'users:edit',
    'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:online_count',
    'users:set_push_token',

    'groups:list',
    'groups:get',
    'groups:add',
    'groups:edit',
    'groups:delete',

    'group_discounts:list',
    'group_discounts:get',
    'group_discounts:add',
    'group_discounts:edit',
    'group_discounts:delete',

    'messages:list',
    'messages:count',
    'messages:mark_read',
    'messages:mark_unread',
    'messages:send',
    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    'messages:get',
    'messages:add',
    'messages:edit',
    'messages:delete',

    'message_templates:list',
    'message_templates:get',
    'message_templates:add',
    'message_templates:edit',
    'message_templates:delete',

    'pages:list',
    'pages:get',
    'pages:add',
    'pages:edit',
    'pages:delete',

    'news:list',
    'news:get',
    'news:add',
    'news:edit',
    'news:delete',

    'addresses:perms-all',
    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'orders:perms-all',
    'orders:list',
    'orders:get',
    'orders:add',
    'orders:edit',
    'orders:mass_edit',
    'orders:edit_tags',
    'orders:calc',
    'orders:delete',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:history',
    'orders:api_log',
    'orders:place',
    
    'tags:list',
    'tags:get',
    'tags:add',
    'tags:edit',
    'tags:delete',

    'companies:list',
    'companies:get',
    'companies:add',
    'companies:edit',
    'companies:delete',

    'carriers:list',
    'carriers:get',
    'carriers:add',
    'carriers:edit',
    'carriers:delete',

    'countries:list',
    'countries:get',
    'countries:add',
    'countries:edit',
    'countries:delete',

    'additional_services:list',
    'additional_services:get',
    'additional_services:add',
    'additional_services:edit',
    'additional_services:delete',

    'regions:list',
    'regions:get',
    'regions:add',
    'regions:edit',
    'regions:delete',

    'zones:list',
    'zones:get',
    'zones:add',
    'zones:edit',
    'zones:delete',
    'zones:clone',

    'rates:list',
    'rates:get',
    'rates:add',
    'rates:edit',
    'rates:clone',
    'rates:delete',
    'rates:search',

    'rate_params:list',
    'rate_params:get',
    'rate_params:add',
    'rate_params:edit',
    'rate_params:delete',

    'reports:perms-all',
    'reports:orders',
    'reports:orders_type_full',
    'reports:orders_type_short',
    'reports:orders_type_client',
    'reports:orders_type_carrier',
    'reports:orders_type_accountant',
    'reports:orders_type_sales',
    'reports:orders_type_sales_summary',
    
    'sales_clients:list',
    'sales_clients:get',
    'sales_clients:add',
    'sales_clients:edit',
    'sales_clients:delete',

    'sales_users:list',
    'sales_users:get',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.supervisor]: [
    'menu:dashboard',
    'menu:orders',
    'menu:messages',
    'menu:companies',
    'menu:users',
    'menu:groups',
    'menu:carriers',
    //'menu:geography',
    'menu:reports',
    //'menu:pages',
    //'menu:news',
    'menu:config',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',
    'config:set',

    'package_types:list',

    'geo_data:list',

    'rate_types:list',

    'messages:list',
    'messages:count',
    'messages:mark_read',
    'messages:mark_unread',
    'messages:send',
    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    'messages:get',

    'message_templates:list',
    'message_templates:get',
    'message_templates:add',
    'message_templates:edit',
    'message_templates:delete',

    'users:perms-all',
    'users:extended_view',
    'users:list_orders',
    'users:list',
    'users:get',
    'users:add',
    'users:edit',
    'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:online_count',
    'users:set_push_token',

    'companies:list',
    'companies:get',
    'companies:add',
    'companies:edit',
    'companies:delete',

    'groups:list',
    'groups:get',
    'groups:add',
    'groups:edit',
    'groups:delete',

    'group_discounts:list',
    'group_discounts:get',
    'group_discounts:add',
    'group_discounts:edit',
    'group_discounts:delete',

    'carriers:list',
    'carriers:get',
    'carriers:add',
    'carriers:edit',
    'carriers:delete',

    'orders:perms-all',
    'orders:list',
    'orders:get',
    'orders:add',
    'orders:edit',
    'orders:mass_edit',
    'orders:edit_tags',
    'orders:calc',
    'orders:delete',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:history',
    'orders:api_log',
    'orders:place',

    'tags:list',
    'tags:get',
    'tags:add',
    'tags:edit',
    'tags:delete',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'additional_services:list',
    'additional_services:get',
    'additional_services:add',
    'additional_services:edit',
    'additional_services:delete',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'zones:list',
    'zones:get',
    'zones:add',
    'zones:edit',
    'zones:delete',
    'zones:clone',

    'rates:list',
    'rates:get',
    'rates:add',
    'rates:edit',
    'rates:clone',
    'rates:delete',
    'rates:search',

    'rate_params:list',
    'rate_params:get',
    'rate_params:add',
    'rate_params:edit',
    'rate_params:delete',

    'reports:perms-all',
    'reports:orders',
    'reports:orders_type_full',
    'reports:orders_type_short',
    'reports:orders_type_client',
    'reports:orders_type_carrier',
    'reports:orders_type_accountant',
    'reports:orders_type_sales',
    'reports:orders_type_sales_summary',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.manager]: [
    'menu:dashboard',
    'menu:orders',
    'menu:messages',
    'menu:companies',
    'menu:users',
    'menu:groups',
    //'menu:carriers',
    //'menu:geography',
    //'menu:pages',
    //'menu:news',
    //'menu:config',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'messages:list',
    'messages:count',
    'messages:mark_read',
    'messages:mark_unread',
    'messages:send',
    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    'messages:get',

    'message_templates:list',
    'message_templates:get',
    'message_templates:add',
    'message_templates:edit',
    'message_templates:delete',

    'users:perms-all',
    'users:extended_view',
    'users:list_orders',
    'users:list',
    'users:get',
    'users:add',
    'users:edit',
    //'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:online_count',
    'users:set_push_token',

    'companies:list',
    'companies:get',

    'groups:list',
    'groups:get',

    'carriers:list',

    'orders:perms-all',
    'orders:list',
    'orders:get',
    'orders:add',
    'orders:edit',
    'orders:mass_edit',
    'orders:edit_tags',
    'orders:calc',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:history',
    'orders:api_log',
    'orders:place',

    'tags:list',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',

    'reports:perms-all',
    'reports:orders',
    'reports:orders_type_full',
    'reports:orders_type_short',
    'reports:orders_type_client',
    'reports:orders_type_carrier',
    'reports:orders_type_accountant',
    'reports:orders_type_sales',
    'reports:orders_type_sales_summary',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.company_manager]: [
    'menu:dashboard',
    'menu:orders',
    //'menu:messages',
    //'menu:companies',
    'menu:users',
    //'menu:groups',
    //'menu:carriers',
    //'menu:geography',
    //'menu:pages',
    //'menu:news',
    //'menu:config',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',

    'users:perms-all',
    'users:list',
    'users:get',
    'users:add',
    'users:edit',
    //'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:set_push_token',

    'companies:list',
    'companies:get',

    'groups:list',
    'groups:get',

    'carriers:list',

    'orders:perms-all',
    'orders:list',
    'orders:get',
    //'orders:add',
    //'orders:edit',
    //'orders:mass_edit',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',

    'tags:list',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',
    
    'reports:perms-all',
    'reports:orders',
    'reports:orders_type_client',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.operator]: [
    'menu:dashboard',
    'menu:orders',
    'menu:messages',
    //'menu:companies',
    'menu:users',
    //'menu:groups',
    //'menu:carriers',
    //'menu:geography',
    //'menu:pages',
    //'menu:news',
    //'menu:config',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'messages:list',
    'messages:count',
    'messages:mark_read',
    'messages:mark_unread',
    'messages:send',
    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    'messages:get',

    'message_templates:list',
    'message_templates:get',
    'message_templates:add',
    'message_templates:edit',
    //'message_templates:delete',

    'users:perms-all',
    'users:extended_view',
    'users:list_orders',
    'users:list',
    'users:get',
    //'users:add',
    //'users:edit',
    //'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:online_count',
    'users:set_push_token',

    'companies:list',
    'companies:get',

    'groups:list',
    'groups:get',

    'carriers:list',

    'orders:perms-all',
    'orders:list',
    'orders:get',
    'orders:add',
    'orders:edit',
    'orders:mass_edit',
    'orders:edit_tags',
    'orders:calc',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:history',
    'orders:api_log',
    'orders:place',

    'tags:list',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.sales_manager]: [
    'menu:sales',
    'menu:users',
    'menu:reports',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',
    
    'users:perms-all',
    'users:list',
    'users:get',
    'users:add',
    'users:edit',
    //'users:delete',
    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:set_push_token',

    'orders:list',
    'orders:get',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',
    
    'companies:list',
    //'companies:get',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'groups:list',
    'groups:get',

    'carriers:list',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',

    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    
    'reports:perms-all',
    'reports:orders',
    //'reports:orders_type_client',
    'reports:orders_type_sales',
    'reports:orders_type_sales_summary',
    
    'sales_clients:list',
    'sales_clients:get',
    'sales_clients:add',

    'sales_users:list',
    'sales_users:get',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.sales]: [
    'acl:get',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:get',
    'users:edit',
    'users:set_push_token',

    'orders:list',
    'orders:get',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',

    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    
    'reports:orders',
    'reports:orders_type_client',
    'reports:orders_type_sales',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.carrier_manager]: [
    'menu:dashboard',
    'menu:carriers',
    //'menu:geography',

    'dashboard:month_orders_count',
    'dashboard:orders_status_count',

    'acl:list',
    'acl:get',
    'acl:roles',

    'config:get',
    'config:set',

    'package_types:list',

    'geo_data:list',

    'rate_types:list',

    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',

    'message_templates:list',
    'message_templates:get',

    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:get',
    'users:edit',
    'users:set_push_token',
    'users:online_count',

    'companies:list',
    'companies:get',

    'groups:list',
    'groups:get',

    'group_discounts:list',
    'group_discounts:get',

    'carriers:list',
    'carriers:get',
    'carriers:add',
    'carriers:edit',
    'carriers:delete',

    'orders:list',
    'orders:get',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',

    'tags:list',
    'tags:get',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'additional_services:list',
    'additional_services:get',
    'additional_services:add',
    'additional_services:edit',
    'additional_services:delete',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'zones:list',
    'zones:get',
    'zones:add',
    'zones:edit',
    'zones:delete',
    'zones:clone',

    'rates:list',
    'rates:get',
    'rates:add',
    'rates:edit',
    'rates:clone',
    'rates:delete',
    'rates:search',

    'rate_params:list',
    'rate_params:get',
    'rate_params:add',
    'rate_params:edit',
    'rate_params:delete',

    'reports:orders',
    'reports:orders_type_client',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
  [roles.client]: [
    'acl:get',

    'config:get',

    'package_types:list',
    
    'geo_data:list',

    'rate_types:list',

    'users:login',
    'users:login_with_key',
    'users:request_login_key',
    'users:logout',
    'users:register',
    'users:get',
    'users:edit',
    'users:set_push_token',

    'orders:list',
    'orders:get',
    'orders:attachment_download',
    'orders:invoice_download',
    'orders:place',

    'pages:list',
    'pages:get',

    'news:list',
    'news:get',

    'countries:list',
    'countries:get',

    'addresses:list',
    'addresses:get',
    'addresses:add',
    'addresses:edit',
    'addresses:delete',
    'addresses:suggest',

    'regions:list',
    'regions:get',

    'rates:search',

    'messages:user_list',
    'messages:user_mark_read',
    'messages:user_send',
    'messages:user_count',
    'messages:attachment_download',
    
    'reports:orders',
    'reports:orders_type_client',

    'yandex:estimate',
    'yandex:create',
    'yandex:confirm',
    'yandex:track',
  ],
};

const isAllowed = (role, perm) => {
  if (typeof perms[role] === 'undefined')
    throw Error(`Role "${role}" does not exist.`);
  return perms[role].indexOf(perm) > -1;
};

const getPerms = (role) => {
  if (typeof perms[role] === 'undefined')
    throw Error(`Role "${role}" does not exist.`);
  return perms[role];
};

module.exports = { roles, rolesSubordinaries, perms, isAllowed, getPerms };
