module.exports = (sequelize, DataTypes) => {
  const Address = sequelize.define('Address', {
    address: DataTypes.STRING, // accumulated field
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    companyName: DataTypes.STRING,
    phone: DataTypes.STRING,
    email: DataTypes.STRING,
    postCode: DataTypes.STRING,
    province: DataTypes.STRING,
    city: DataTypes.STRING,
    addressLine1: DataTypes.STRING,
    addressLine2: DataTypes.STRING,
    langCode: DataTypes.STRING,
    isSource: DataTypes.BOOLEAN,
    //isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    fiasGUID: DataTypes.UUID,
  });

  const addressHook = models => async (address, options) => {
    const lang = address.langCode || 'en';
    const country = await models.Country.findByPk(address.CountryId);
    const countryName = country ? country.name[lang] : '';
    let accumulatedAddress = '';

    if (address.postCode) accumulatedAddress+= address.postCode + ' ';
    if (countryName) accumulatedAddress+= countryName + ', ';
    if (address.province) accumulatedAddress+= address.province + ', ';
    if (address.city) accumulatedAddress+= address.city + ', ';
    if (address.addressLine1) accumulatedAddress+= address.addressLine1 + (!address.addressLine2 ? ' / ': ' ');
    if (address.addressLine2) accumulatedAddress+= address.addressLine2 + (!address.addressLine1 ? ' / ': ' ');
    if (address.firstName) accumulatedAddress+= address.firstName + (!address.lastName ? ' / ': ' ');
    if (address.lastName) accumulatedAddress+= address.lastName + ' / ';
    if (address.companyName) accumulatedAddress+= address.companyName + ' / ';
    if (address.phone) accumulatedAddress+= address.phone + ' / ';
    if (address.email) accumulatedAddress+= address.email + ' ';

    accumulatedAddress = accumulatedAddress.substring(0, 255);

    address.address = accumulatedAddress;
  }

  Address.associate = function(models) {
    models.Address.addHook('beforeCreate', addressHook(models));
    models.Address.addHook('beforeUpdate', addressHook(models));

    models.Address.belongsTo(models.Country);
    models.Address.belongsTo(models.User);
  };

  return Address;
};
