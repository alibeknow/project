const bcrypt = require('bcrypt');
const uuid_v4 = require('uuid').v4;

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    email: { type: DataTypes.STRING, unique: true, },
    password: DataTypes.STRING,
    role: {
      type: DataTypes.STRING, // admin, manager, operator, client
      validate: {
        isProperValue(value) {
          if (
            value != 'admin' &&
            value != 'supervisor' &&
            value != 'manager' &&
            value != 'company_manager' &&
            value != 'operator' &&
            value != 'sales_manager' &&
            value != 'sales' &&
            value != 'carrier_manager' &&
            value != 'client'
          ) {
            throw new Error('Only "admin", "supervisor", "manager", "company_manager", "operator", "sales_manager", "sales", "carrier_manager", "client" values are allowed!');
          }
        }
      }
    },
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    prettyName: DataTypes.STRING,
    phone: DataTypes.STRING,
    isActive: DataTypes.BOOLEAN,
    isAPIActive: DataTypes.BOOLEAN,
    APIKey: DataTypes.STRING,
    APICallbackURL: DataTypes.STRING,
    isCompany: { type: DataTypes.BOOLEAN, initialValue: false, },
    companyName: DataTypes.STRING,
    companyAddress: DataTypes.STRING,
    physicalAddress: DataTypes.STRING,
    taxPayerNumber: DataTypes.STRING,
    businessIDNumber: DataTypes.STRING,
    individualIDCode: DataTypes.STRING,
    bankIDCode: DataTypes.STRING,
    bankName: DataTypes.STRING,
    bankAccount: DataTypes.STRING,
    lastActive: DataTypes.DATE,
    lastIP: DataTypes.STRING,
  });

  /*

  Название Компании
  Юридический адрес
  Фактический адрес
  РНН (регистрационный номер налогоплательщика)
  БИН (бизнес-идентификационный номер)
  ИИК (индивидуальный идентификационный код)
  БИК (банковский идентификационный код)
  Название банка
  Расчетный счет
  Контактный телефон

  */

  const hashPasswordHook = async (user, options) => {
    if (user.changed('email')) {
      user.email = user.email.toLowerCase();
    }
    if (user.changed('password')) {
      if (user.get('password') == '') {
        user.password = user.previous('password');
      } else {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        user.password = hashedPassword;
      }
    }
  }

  const prettyNameHook = async (user, options) => {
    if (user.changed('email') || user.changed('firstName') || user.changed('lastName')) {
      user.prettyName = `${user.firstName} ${user.lastName} <${user.email}>`;
    }
  }

  const apiKeyHook = async (user, options) => {
    if (!user.get('APIKey')) {
      user.APIKey = uuid_v4();
    }
  }

  User.addHook('beforeCreate', hashPasswordHook);
  User.addHook('beforeUpdate', hashPasswordHook);

  User.addHook('beforeCreate', prettyNameHook);
  User.addHook('beforeUpdate', prettyNameHook);

  User.addHook('beforeCreate', apiKeyHook);
  User.addHook('beforeUpdate', apiKeyHook);

  User.associate = function(models) {
    models.User.belongsTo(models.Company);
    models.User.hasMany(models.Order, {
      as: 'User',
    });

    models.User.belongsToMany(models.Group, {
      //as: 'Groups',
      through: models.UserGroup,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    models.User.hasMany(models.SalesClient, {
      as: 'SalesClients',
    });

    models.User.hasMany(models.SalesClient, {
      as: 'SalesUsers',
      foreignKey : 'OrderUserId',
    });

    models.User.belongsTo(models.User, {
      as: 'createdBy',
    });
    models.User.belongsTo(models.User, {
      as: 'updatedBy',
    });
  };

  return User;
};
