-- roles
INSERT INTO roles VALUES(1, 'admin', null);
INSERT INTO roles VALUES(2, 'user', null);

-- workspace capabilities
INSERT INTO workspace_capabilities VALUES(
    1,
    'edit_workspace',
    null
);

INSERT INTO workspace_capabilities VALUES(
    2,
    'view_workspace',
    null
);

-- workspace roles
INSERT INTO workspace_roles VALUES(
    1,
    'workspace_admin',
    null
);

INSERT INTO workspace_roles VALUES(
    2,
    'workspace_user',
    null
);

-- workspace role capabilities
INSERT INTO workspace_roles_capabilities VALUES(
    1,
    1, null
);

INSERT INTO workspace_roles_capabilities VALUES(
    1,
    2, null
);

INSERT INTO workspace_roles_capabilities VALUES(
    2,
    2, null
);
