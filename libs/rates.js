const config = require('../config/app');
const moment = require('moment-timezone');

const { Rate, RateRange, PackageType, RateType, RateParam, Carrier, Zone, ZoneRegionFrom, ZoneRegionTo, Country, Region, RegionRule, AdditionalService, Group, GroupDiscount, Sequelize, sequelize } = require('../models');

const configLib = require('./config');
const createAPI = require('./api/factory');

const _round = require('lodash/round');


moment.tz.setDefault(config.timezone);


async function ratesSearch(params) {
  let {
    rateId = null,
    fromCountryId = '',
    toCountryId = '',
    fromCountryISO = '',
    toCountryISO = '',
    fromPostCode = '',
    toPostCode = '',
    fromFiasGUID = '',
    toFiasGUID = '',
    fromCity = '',
    toCity = '',
    fromAddress = '',
    toAddress = '',
    packageTypeId = '',
    packageType = '',
    packages = [],
    declaredValue = 0,
    limit = 100,
    offset = 0,
    user = undefined,
  } = params;

  limit = parseInt(limit);
  offset = parseInt(offset);

  fromPostCode = !!fromPostCode ? fromPostCode.toUpperCase() : '';
  toPostCode   = !!toPostCode ? toPostCode.toUpperCase() : '';

  const fromCountryWhere = {};
  if (fromCountryId)  fromCountryWhere.id   = fromCountryId;
  if (fromCountryISO) fromCountryWhere.code = fromCountryISO;

  const toCountryWhere = {};
  if (toCountryId)  toCountryWhere.id   = toCountryId;
  if (toCountryISO) toCountryWhere.code = toCountryISO;

  const packageTypeWhere = {};
  if (packageTypeId) packageTypeWhere.id   = packageTypeId;
  if (packageType)   packageTypeWhere.type = packageType;

  if (Object.keys(fromCountryWhere).length == 0) throw Error('fromCountry(Id|ISO) is not defined.');
  if (Object.keys(toCountryWhere).length == 0) throw Error('toCountry(Id|ISO) is not defined.');
  if (Object.keys(packageTypeWhere).length == 0) throw Error('packageType(Id)? is not defined.');

  let groups = [];
  if (user) {
    groups = user.Groups;
  } else {
    const group = await Group.findOne({
      where: { isDefault: true },
      include: [
        {
          model: GroupDiscount,
          include: [
            {
              model: Zone,
              as: 'Zones',
            }
          ],
        },
      ],
    });
    if (!group) throw Error('Default User Group is not defined.');
    groups.push(group);
  }

  let regionsFrom = await Region.findAll({
    include: [
      {
        model: Country,
        required: true,
        where: fromCountryWhere,
      },
      {
        model: RegionRule,
        required: true,
        where: Sequelize.where(Sequelize.fn('trim', fromPostCode), { [Sequelize.Op.iLike]: Sequelize.col('"RegionRules"."rule"') }),
      },
    ],
  });
  let regionsTo = await Region.findAll({
    include: [
      {
        model: Country,
        required: true,
        where: toCountryWhere,
      },
      {
        model: RegionRule,
        required: true,
        where: Sequelize.where(Sequelize.fn('trim', toPostCode), { [Sequelize.Op.iLike]: Sequelize.col('"RegionRules"."rule"') }),
      },
    ],
  });

  // console.log('regionsFrom:', regionsFrom);
  // console.log('regionsTo:', regionsTo);

  let { count, rows } = await Rate.findAndCountAll({
    include: [
      {
        model: PackageType,
        required: true,
        where: packageTypeWhere,
      },
      {
        model: RateType,
        required: true,
      },
      {
        model: RateRange,
        required: true,
      },
      {
        model: Group,
        required: true,
        where: {
          id: {
            [Sequelize.Op.in]: groups.map((group) => group.id),
          },
        },
      },
      {
        model: Zone,
        required: true,
        include: [
          {
            model: ZoneRegionFrom,
            required: true,
            where: {
              RegionId: {
                [Sequelize.Op.in]: regionsFrom.map((n) => n.id),
              },
            },
          },
          {
            model: ZoneRegionTo,
            required: true,
            where: {
              RegionId: {
                [Sequelize.Op.in]: regionsTo.map((n) => n.id),
              },
            },
          },
          {
            model: AdditionalService,
            required: false,
            as: 'AdditionalServices',
            where: {
              GroupId: {
                [Sequelize.Op.in]: groups.map((group) => group.id),
              },
            },
          },
          {
            model: Carrier,
            required: true,
            //attributes: { exclude: ['logo'] },
            where: {
              isActive: true,
            },
            include: [
              {
                model: RateParam,
                required: true,
                where: {
                  PackageTypeId: {[Sequelize.Op.col]: '"Rate"."PackageTypeId"'},
                  RateTypeId: {[Sequelize.Op.col]: '"Rate"."RateTypeId"'},
                },
              },
            ],
          },
        ],
      },
    ],
  });

  if (rateId) {
    rows = rows.filter((r) => r.id == rateId);
  }

  const { percentVAT, precision, holidaysDates } = await configLib.get();
  const round = (num) => _round(num, precision);
  rows = await Promise.all(rows.map(async(rate) => {
    rate = rate.toJSON();
    
    rate.Zone.RegionsFrom = regionsFrom;
    rate.Zone.RegionsTo = regionsTo;
    
    // console.log('rate:', rate);

    let isMultiPackage = rate.Zone.Carrier.RateParams[0].isMultiPackage;
    let _packages = calcPackagesPrice({ rate, packages, isMultiPackage, groups, precision });

    if (!_packages) return null;
    let {
      packagesTotalDiscountPrice,
      packagesTotalFuelTax,
      packagesTotalPrice,
    } = _packages;

    let insurance = calcInsuranceIncluded({ rate, declaredValue, precision });

    let priceTaxExcluded = round(+(packagesTotalPrice));

    let taxVAT = 0;
    if (rate.Zone.hasVAT) {
      taxVAT = round(+(priceTaxExcluded * (parseFloat(percentVAT) / 100)));
    }

    let priceTaxIncluded = priceTaxExcluded + taxVAT + insurance;

    rate.Zone.AdditionalServices = calcServicesPrice({ services: rate.Zone.AdditionalServices, deliveryCost: priceTaxExcluded, declaredValue, precision, percentVAT });

    let totalPrice = priceTaxIncluded;

    let overrideParams = {};

    let fromKladrCode = '';
    let toKladrCode = '';

    if (fromFiasGUID) {
      const fromRegion = await Region.findOne({
        where: {
          fiasGUID: fromFiasGUID,
          CountryId: rate.Zone.RegionsFrom[0].Country.id,
        },
      });

      if (fromRegion) {
        fromKladrCode = fromRegion.kladrCode;
      }
    }
    if (toFiasGUID) {
      const toRegion = await Region.findOne({
        where: {
          fiasGUID: toFiasGUID,
          CountryId: rate.Zone.RegionsTo[0].Country.id,
        },
      });

      if (toRegion) {
        toKladrCode = toRegion.kladrCode;
      }
    }
	
    if (rate && rate.Zone.Carrier.isRateByCarrierApi) {
      const api = createAPI(rate.Zone.Carrier.api);

      // console.warn('!DEBUG: rate-by-API mode', rate.Zone.RegionsFrom[0].Country.code, fromPostCode, ' => ', rate.Zone.RegionsTo[0].Country.code, toPostCode);
        
      // console.warn('!DEBUG: fromFiasGUID, ', fromFiasGUID, ' toFiasGUID, ', toFiasGUID);
      // console.log('**************************API Instance:')
      // console.log('apiType: ', rate.Zone.Carrier.api);
      // console.log(api)

      let carrierRate;
      try {
        carrierRate = await api.getRate({
          addressDetailsFrom: {
            countryCode: rate.Zone.RegionsFrom[0].Country.code,
            postCode: fromPostCode,
            fiasGUID: fromFiasGUID,
            kladrCode: fromKladrCode,
            city: fromCity,
            addressLine1: fromAddress,
          },
          addressDetailsTo: {
            countryCode: rate.Zone.RegionsTo[0].Country.code,
            postCode: toPostCode,
            fiasGUID: toFiasGUID,
            kladrCode: toKladrCode,
            city: toCity,
            addressLine1: toAddress,
          },
          packages,
          packageType: rate.PackageType.type,
          packageTypeId: rate.PackageType.id,
          rate,
        });
        
        // console.warn(`Carrier Rate(s) from the ${rate.Zone.Carrier.api}: `, carrierRate);
      } catch (e) {
        console.error(e);
        return null;
      }

      if (Array.isArray(carrierRate)) carrierRate = carrierRate[0];
      
      if (!!carrierRate && carrierRate.extra.deliveryTime != 'undefined') {
        rate.Zone.deliveryTimeFrom = carrierRate.extra.deliveryTime.from != '' ? carrierRate.extra.deliveryTime.from : rate.Zone.deliveryTimeFrom;  
        rate.Zone.deliveryTimeTo = carrierRate.extra.deliveryTime.to != '' ? carrierRate.extra.deliveryTime.to : rate.Zone.deliveryTimeTo;
      }

      if (!carrierRate) return null;
      if (carrierRate.errors) return null;
      
	    isVATIncluded = rate.Zone.Carrier.isVATIncluded;
	    isFuelTaxIncluded = rate.Zone.Carrier.isFuelTaxIncluded;
	
      overrideParams = calcRateByPrice({ rate, packages, config: await configLib.get(), price: carrierRate.price, isVATIncluded, isFuelTaxIncluded, groups });
    }

    delete rate.RateRanges;
    rate.Zone.AdditionalServices = rate.Zone.AdditionalServices.map((service) => {
      delete service.companyValue;
      return service;
    });
    
    const ret = {
      ...rate,
      bookBeforeDateTime: calcBookBeforeDateTime(rate, holidaysDates),
      packagesTotalPrice: packagesTotalPrice,
      insurance: insurance,
      priceTaxExcluded: priceTaxExcluded,
      taxVAT: taxVAT,
      priceTaxIncluded: priceTaxIncluded,
      totalPrice: totalPrice,
      ...overrideParams,
    }

    if (!ret.totalPrice) return null;

    return (ret);
  }));

  rows = rows.filter(n => n); // remove nulls
  rows = rows.map((row) => {
    if (row.PackageType.type == 'documents') {
      if (row.Zone.AdditionalServices && Array.isArray(row.Zone.AdditionalServices)) {
        row.Zone.AdditionalServices = row.Zone.AdditionalServices.filter((n) => n.calcType == 'fixed_price');
      }
    }
    
    return row;
  });
  rows = calcBestPrice(rows);
  rows = sortRates(rows);
  rows = rows.slice(offset, offset + limit);

  if (rateId) {
    return rows[0];
  }

  return { data: rows, count };
}

module.exports.ratesSearch = ratesSearch;


const weekdayToISOWeekday = (weekday) => {
  const daysOfWeek = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const index = daysOfWeek.indexOf(weekday);
  if (index == -1) throw Error('weekday is incorrect.');
  return index + 1;
}

const calcBookBeforeDateTime = (rate, holidaysDates = []) => {
  if (!rate.Zone.Carrier.RateParams || rate.Zone.Carrier.RateParams.length == 0) throw Error('RateParams are not defined.');
  const workingDays = Object.values(rate.Zone.Carrier.RateParams[0].workingDays)
    .map((weekday) => weekdayToISOWeekday(weekday));
  const bookBeforeTime = rate.Zone.Carrier.RateParams[0].bookBefore;

  if (workingDays.length == 0) throw Error('workingDays are not defined.');

  let bookBeforeDateTime = null;
  let weekday = moment().startOf('day').isoWeekday();
  let i = weekday;
  while (i < 1000) { // to prevent possible infinite loop
    if (weekday > 7) weekday = 1;
    let [hours, minutes, seconds] = bookBeforeTime.split(':');
    bookBeforeDateTime = moment().startOf('day').isoWeekday(i).hours(hours).minutes(minutes).seconds(seconds);
    if (
      (workingDays.indexOf(weekday) > -1)
      && (!holidaysDates.find((e) => e == moment().startOf('day').isoWeekday(i).format('YYYY-MM-DD')))
      && (moment() < bookBeforeDateTime)
    ) {
      break;
    }
    weekday++;
    i++;
  };

  //console.log('bookBeforeDateTime', bookBeforeDateTime.toString());
  return bookBeforeDateTime;
}

module.exports.calcBookBeforeDateTime = calcBookBeforeDateTime;


const calcPickupDates = (pickupDatesCount, holidaysDates, rate) => {
  let items = [];
  let i = 0;
  while (items.length < pickupDatesCount) {
    let day = moment().startOf('day').add(i, 'd');
    i++;

    if (holidaysDates.find((e) => e == day.format('YYYY-MM-DD'))) continue;

    let weekDaysOff = rate.Zone.Carrier.RateParams[0].workingDays.map((e) => weekdayToISOWeekday(e));
    if (!weekDaysOff.find((e) => day.isoWeekday() == e)) continue;

    let bookBeforeDateTime = moment(day.format('YYYY-MM-DD') + ' ' + rate.Zone.Carrier.RateParams[0].bookBefore);
    if (moment() > bookBeforeDateTime) continue;

    items.push(day);
  }

  return items;
}

module.exports.calcPickupDates = calcPickupDates;


const convertRateRangesToRateTable = (rateRanges) => {
  let rateTable = [];

  for (let rateRange of rateRanges) {
    let { weightFrom, weightTo, price, step, pricePerStep, marginMin, margin, discount } = rateRange;
    weightFrom    = parseFloat(weightFrom);
    weightTo      = parseFloat(weightTo);
    price         = parseFloat(price);
    step          = parseFloat(step);
    pricePerStep  = parseFloat(pricePerStep);
    marginMin     = parseFloat(marginMin);
    margin        = parseFloat(margin);
    discount      = parseFloat(discount);

    if (weightFrom > weightTo) continue;

    if (step > 0) {
      let i;
      let multiplier = 0;
      for (i = weightFrom; i <= weightTo - step; i += step) {
        let rateRow = {
          weightFrom: i + 0.001,
          weightTo:   i + step,
          price:      price + (pricePerStep * multiplier),
          marginMin:  marginMin,
          margin:     margin,
          discount:   discount,
        };
        rateTable.push(rateRow);

        multiplier++;
      }

      if (i < weightTo) {
        let rateRow = {
          weightFrom: i + 0.001,
          weightTo:   weightTo,
          price:      price + (pricePerStep * multiplier),
          marginMin:  marginMin,
          margin:     margin,
          discount:   discount,
        };
        rateTable.push(rateRow);
      }
    } else {
      let rateRow = {
        weightFrom: weightFrom + 0.001,
        weightTo:   weightTo,
        price:      price,
        marginMin:  marginMin,
        margin:     margin,
        discount:   discount,
      };
      rateTable.push(rateRow);
    }
  }

  return rateTable;
}

const findRateByWeight = (rateTable, weight) => {
  for (let rateRow of rateTable) {
    if (weight >= rateRow.weightFrom && weight <= rateRow.weightTo) return rateRow;
  }

  return null;
}

const getGroupDiscountByZone = (group, zoneId) => {
  if (!group) throw Error('group is not defined.');
  if (!group.GroupDiscounts) throw Error('GroupDiscounts are not defined.');
  const groupDiscounts = group.GroupDiscounts;

  let discount = 0;
  for (let groupDiscount of groupDiscounts) {
    let zones = groupDiscount.Zones.map((zone) => zone.id);
    if (zones.indexOf(zoneId) > -1) {
      discount += parseFloat(groupDiscount.discount);
    }
  }

  return discount;
}

const calcPackagesPrice = ({ rate, packages = [], isMultiPackage = false, groups = [], precision }) => {
  
  const round = (num) => _round(num, precision);
  
  if (packages.length == 0) throw Error('packages are empty.');
  if (groups.length == 0) throw Error('groups are empty.');

  if (!rate.Zone.Carrier.RateParams || rate.Zone.Carrier.RateParams.length == 0) throw Error('RateParams are not defined.');
  const rateParams = rate.Zone.Carrier.RateParams[0];

  if (!rate.RateRanges || rate.RateRanges.length == 0) throw Error('RateRanges are not defined.');
  const rateTable = convertRateRangesToRateTable(rate.RateRanges);
  //console.log(rateTable);
  //throw Error(':)');

  let clientDiscount = groups.map((group) => parseFloat(group.discount))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);
  //console.log('clientDiscount:', clientDiscount);

  let clientDiscountByZone = groups.map((group) => getGroupDiscountByZone(group, rate.Zone.id))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);;
  //console.log('clientDiscountByZone:', clientDiscountByZone);

  let clientTotalDiscount = clientDiscount + clientDiscountByZone;
  //console.log('clientTotalDiscount:', clientTotalDiscount);


    for (let package of packages) {
      package.quantity  = parseInt(package.quantity, 10);
      package.weight    = parseFloat(package.weight);
      package.volumeWeight = parseFloat(package.volumeWeight);
      package.width     = parseFloat(package.width);
      package.height    = parseFloat(package.height);
      package.depth     = parseFloat(package.depth);

      let physicalWeight = package.weight;
      let volumeWeight   = 0;

      if (parseFloat(rateParams.volumeWeightDivider) > 0) {
        volumeWeight = (package.width * package.height * package.depth) / parseFloat(rateParams.volumeWeightDivider);
      }
      let calcWeight = Math.max(physicalWeight, volumeWeight);
      //console.log('physicalWeight:', physicalWeight);
      //console.log('volumeWeight:', volumeWeight);
      //console.log('calcWeight:', calcWeight);

      let rateRow = findRateByWeight(rateTable, calcWeight);
      //console.log('rateRow:', rateRow);

      if (!rateRow) {
        return null;
      }

      let basePrice       = rateRow.price;
      let finalBasePrice  = round(basePrice);
      
      if (
        package.width   > parseFloat(rateParams.maxPackageWidth) ||
        package.height  > parseFloat(rateParams.maxPackageHeight) ||
        package.depth   > parseFloat(rateParams.maxPackageDepth) ||
        package.weight  > parseFloat(rateParams.maxPackageWeight) 
      ) {
        if (parseFloat(rateParams.oversizeMultiplier) > 0) {
          finalBasePrice = round(basePrice * parseFloat(rateParams.oversizeMultiplier));
        } else {
          // console.log('oversizeMultiplier is 0, bye');
          return null;
        }
      }

      let discountPrice   = round(finalBasePrice - (finalBasePrice * (rateRow.discount / 100)));
      let marginMinPrice  = round(discountPrice + (finalBasePrice * (rateRow.marginMin / 100)));
      let marginPrice     = round(discountPrice + (finalBasePrice * (rateRow.margin / 100)));

      let clientDiscountAmount = round(marginPrice * (clientTotalDiscount / 100));
      let clientDiscountPrice  = marginPrice - clientDiscountAmount;
      let clientRatePrice      = Math.max(marginMinPrice, clientDiscountPrice);

      let fuelTaxAmount = round((discountPrice * (parseFloat(rate.Zone.Carrier.fuelTax) / 100)));
      let totalPrice    = clientRatePrice + fuelTaxAmount;

      // console.log('*************************No MultiplePackage Data');
      // console.log('basePrice:', basePrice);
      // console.log('finalBasePrice:', finalBasePrice);
      // console.log('discountPrice:', discountPrice);
      // console.log('marginMinPrice:', marginMinPrice);
      // console.log('marginPrice:', marginPrice);
      // console.log('clientDiscountAmount:', clientDiscountAmount);
      // console.log('clientDiscountPrice:', clientDiscountPrice);
      // console.log('clientRatePrice:', clientRatePrice);
      // console.log('fuelTaxAmount:', fuelTaxAmount);
      // console.log('totalPrice:', totalPrice);

      package.price = {
        physicalWeight,
        volumeWeight,
        calcWeight,
        rateRow,
        basePrice,
        finalBasePrice,
        discountPrice,
        marginMinPrice,
        marginPrice,
        clientDiscount,
        clientDiscountByZone,
        clientTotalDiscount,
        clientDiscountAmount,
        clientDiscountPrice,
        clientRatePrice,
        fuelTaxAmount,
        totalPrice,
      };
    }

    const originalPackages = [...packages];
    
    if (isMultiPackage) {

      let multipackageWidth =  packages.map((package) => package.width)
      .reduce((a, v) => a + v, 0);
      let multipackageHeight =  packages.map((package) => package.height)
      .reduce((a, v) => a + v, 0);
      let multipackageDepth =  packages.map((package) => package.depth)
      .reduce((a, v) => a + v, 0);

      let physicalWeight = packages.map((package) => package.price.physicalWeight * package.quantity)
      .reduce((a, v) => a + v, 0);
      let volumeWeight = packages.map((package) => package.price.volumeWeight * package.quantity)
      .reduce((a, v) => a + v, 0);
      let calcWeight = packages.map((package) => package.price.calcWeight * package.quantity)
      .reduce((a, v) => a + v, 0);


      let rateRow = findRateByWeight(rateTable, calcWeight);
      if (!rateRow ) {
        return null;
      }
      let basePrice       = rateRow.price;
      let finalBasePrice  = round(basePrice);

      if (parseFloat(rateParams.oversizeMultiplier) > 0) {
        packages.map((package) => {

          if (
            package.width   > parseFloat(rateParams.maxPackageWidth)  ||
            package.height  > parseFloat(rateParams.maxPackageHeight) ||
            package.depth   > parseFloat(rateParams.maxPackageDepth)  ||
            package.weight  > parseFloat(rateParams.maxPackageWeight)
            
          ) {
            finalBasePrice = round(basePrice * parseFloat(rateParams.oversizeMultiplier));
          }

        });

      }

      let discountPrice        = round(finalBasePrice - (finalBasePrice * (rateRow.discount / 100)));
      let marginMinPrice       = round(discountPrice + (finalBasePrice * (rateRow.marginMin / 100)));
      let marginPrice          = round(discountPrice + (finalBasePrice * (rateRow.margin / 100)));
      let clientDiscountAmount = round(marginPrice * (clientTotalDiscount / 100));
      let clientDiscountPrice  = marginPrice - clientDiscountAmount;
      let clientRatePrice      = Math.max(marginMinPrice, clientDiscountPrice);
      let fuelTaxAmount        = round(discountPrice * (parseFloat(rate.Zone.Carrier.fuelTax) / 100));
      let totalPrice           = clientRatePrice + fuelTaxAmount;

      // console.log('************************* MultiplePackage Data');
      // console.log('basePrice:', basePrice);
      // console.log('finalBasePrice:', finalBasePrice);
      // console.log('discountPrice:', discountPrice);
      // console.log('marginMinPrice:', marginMinPrice);
      // console.log('marginPrice:', marginPrice);
      // console.log('clientDiscountAmount:', clientDiscountAmount);
      // console.log('clientDiscountPrice:', clientDiscountPrice);
      // console.log('clientRatePrice:', clientRatePrice);
      // console.log('fuelTaxAmount:', fuelTaxAmount);
      // console.log('totalPrice:', totalPrice);

      let _packages = [{
        quantity: 1,
        weight: physicalWeight,
        width: multipackageWidth,
        height: multipackageHeight,
        depth: multipackageDepth,
        price: {
          physicalWeight,
          volumeWeight,
          calcWeight,
          rateRow,
          basePrice,
          finalBasePrice,
          discountPrice,
          marginMinPrice,
          marginPrice,
          clientDiscount,
          clientDiscountByZone,
          clientTotalDiscount,
          clientDiscountAmount,
          clientDiscountPrice,
          clientRatePrice,
          fuelTaxAmount,
          totalPrice,
        }
      }];

      packages = _packages;
      
    }

    let packagesTotalDiscountPrice = packages.map((package) => package.price.discountPrice * package.quantity)
      .reduce((a, v) => a + v, 0);
    let packagesTotalFuelTax = packages.map((package) => package.price.fuelTaxAmount * package.quantity)
      .reduce((a, v) => a + v, 0);
    let packagesTotalPrice = packages.map((package) => package.price.totalPrice * package.quantity)
      .reduce((a, v) => a + v, 0);

    return {
      packages: originalPackages,
      clientTotalDiscount,
      packagesTotalDiscountPrice,
      packagesTotalFuelTax,
      packagesTotalPrice,
    };

}

module.exports.calcPackagesPrice = calcPackagesPrice;

const calcBestPrice = (rates) => {
  const arr = rates.map((rate) => rate.totalPrice);
  const indexOfMaxValue = arr.indexOf(Math.min(...arr));

  const result = rates.map((rate, index) => {
    rate.isBestPrice = index === indexOfMaxValue;
    return rate;
  });
  return result;
}

module.exports.calcBestPrice = calcBestPrice;

const calcInsuranceIncluded = ({ rate, declaredValue = 0, precision = 0 }) => {
  const round = (num) => _round(num, precision);

  const { insuranceIncluded, insurancePercentage } = rate.Zone.Carrier;
  let insuranceSumm = round(Math.max(+declaredValue, +insuranceIncluded));
  let insuranceVal = round(+(insuranceSumm * +insurancePercentage / 100));
  return insuranceVal;
}

module.exports.calcInsuranceIncluded = calcInsuranceIncluded;

const calcServicesPrice = ({ services = [], deliveryCost = 0, declaredValue = 0, precision = 0, percentVAT = 0 }) => {
  
  const round = (num) => _round(num, precision);
  
  return services.map((service) => {
    service.companyPrice = 0;
    service.clientPrice = 0;
    service.priceTaxExcluded = 0;
    service.priceTaxIncluded = 0;
    service.price = 0;

    if (service.calcType == 'fixed_price') {
      service.companyPrice = round(parseFloat(service.companyValue));
      service.priceTaxExcluded = round(parseFloat(service.clientValue));
    } else if (service.calcType == 'declared_value_in') {
      service.companyPrice = 0;
      service.priceTaxExcluded = 0;
    } else if (service.calcType == 'declared_value_ex') {
      service.companyPrice = round(parseFloat(declaredValue) * parseFloat(service.companyValue) / 100);
      service.priceTaxExcluded = round((parseFloat(declaredValue) * parseFloat(service.clientValue) / 100));
    }

    service.taxVAT = 0;
    if (service.hasVAT) {
      service.taxVAT = round(+(service.priceTaxExcluded * (parseFloat(percentVAT) / 100)));
    }
    service.priceTaxIncluded = round(service.priceTaxExcluded + service.taxVAT);
    service.price = round(service.priceTaxIncluded);
    service.clientPrice = round(service.priceTaxIncluded);

    return service;
  });
}

module.exports.calcServicesPrice = calcServicesPrice;

const sortRates = (rates) => {
  return rates.sort((a, b) => (a.totalPrice - b.totalPrice));
}

module.exports.sortRates = sortRates;

const calcYandexGo = ({ rate, config, price, groups=[] }) => {
  const { percentVAT, precision } = config;
  const round = (num) => _round(num, precision);
  const insurance = 0;
  const declaredValue = 0;
  // let fuelTax = 0;

  let clientDiscount = groups.map((group) => parseFloat(group.discount))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);

  let clientDiscountByZone = groups.map((group) => getGroupDiscountByZone(group, rate.Zone.id))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);;

  let clientTotalDiscount = clientDiscount + clientDiscountByZone;

  const rateRow = rate.RateRanges[0];
  const finalBasePrice = round(price);
  let discountPrice   = round(finalBasePrice - (finalBasePrice * (rateRow.discount / 100)));
  let marginMinPrice  = round(discountPrice + (finalBasePrice * (rateRow.marginMin / 100)));
  let marginPrice     = round(discountPrice + (finalBasePrice * (rateRow.margin / 100)));

  let clientDiscountAmount = round(marginPrice * (clientTotalDiscount / 100));
  let clientDiscountPrice  = marginPrice - clientDiscountAmount;
  let clientPrice      = Math.max(marginMinPrice, clientDiscountPrice);

  if (rate.Zone.hasVAT) console.log('zone has vat');

  let fuelTax = round(discountPrice * (+rate.Zone.Carrier.fuelTax) / 100);
  const companyPrice = discountPrice;
  const priceTaxExcluded = round(clientPrice);
  const packagesTotalPrice = priceTaxExcluded;
  const taxVAT = round(rate.Zone.hasVAT ? (priceTaxExcluded * percentVAT / 100) : 0);
  const priceTaxIncluded = priceTaxExcluded + fuelTax;
  const totalPrice = priceTaxIncluded + taxVAT;

  return(
    { 
      insurance,
      declaredValue,
      percentVAT,
      packagesTotalPrice,
      fuelTax,
      taxVAT,
      priceTaxExcluded,
      priceTaxIncluded,
      totalPrice,
      clientDiscount: clientTotalDiscount,
      clientPrice,
      companyPrice,
    }
  )
}
module.exports.calcYandexGo = calcYandexGo;

const calcRateByPrice = ({ rate, packages, config, price, isVATIncluded, isFuelTaxIncluded, groups=[] }) => {
  const { percentVAT, precision } = config;
  const round = (num) => _round(num, precision);
  const insurance = 0;
  const declaredValue = 0;

  let clientDiscount = groups.map((group) => parseFloat(group.discount))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);

  let clientDiscountByZone = groups.map((group) => getGroupDiscountByZone(group, rate.Zone.id))
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);;

  let clientTotalDiscount = clientDiscount + clientDiscountByZone;

  // const rateRow = rate.RateRanges[0];

  let calcWeight = packages.map((package) => package.price.calcWeight * package.quantity)
  .reduce((a, v) => a + v, 0);
  console.log('calcWeight: ', calcWeight);

  if (!rate.RateRanges || rate.RateRanges.length == 0) throw Error('RateRanges are not defined.');
  const rateTable = convertRateRangesToRateTable(rate.RateRanges);
  let rateRow = findRateByWeight(rateTable, calcWeight);
  if (!rateRow ) {
    return null;
  }
  console.warn('calcRateByPrice rateRow', rateRow);


  const finalBasePrice = round(price);
  let discountPrice   = round(finalBasePrice - (finalBasePrice * (rateRow.discount / 100)));
  let marginMinPrice  = round(discountPrice + (finalBasePrice * (rateRow.marginMin / 100)));
  let marginPrice     = round(discountPrice + (finalBasePrice * (rateRow.margin / 100)));

  let clientDiscountAmount = round(marginPrice * (clientTotalDiscount / 100));
  let clientDiscountPrice  = marginPrice - clientDiscountAmount;
  let clientPrice = Math.max(marginMinPrice, clientDiscountPrice);

  // console.log('discountPrice:', discountPrice);
  // console.log('marginMinPrice:', marginMinPrice);
  // console.log('marginPrice:', marginPrice);
  // console.log('clientDiscountAmount:', clientDiscountAmount);
  // console.log('clientDiscountPrice:', clientDiscountPrice);
  // console.log('clientPrice:', clientPrice);
  // console.log('rateRow.margin:', rateRow.margin);

  let fuelTax = round(discountPrice * (+rate.Zone.Carrier.fuelTax) / 100);
  const companyPrice = discountPrice;
  const priceTaxExcluded = round(clientPrice) - (isFuelTaxIncluded ? fuelTax : 0);
  const packagesTotalPrice = priceTaxExcluded;
  const taxVAT = round(rate.Zone.hasVAT ? (priceTaxExcluded * percentVAT / 100) : 0);
  let taxVATAmount = isVATIncluded ? 0 : taxVAT;
  const priceTaxIncluded = priceTaxExcluded + fuelTax;
  const totalPrice = priceTaxIncluded + taxVATAmount;
  
  return(
    { 
      insurance,
      declaredValue,
      percentVAT,
      packagesTotalPrice,
      fuelTax,
      taxVAT,
      priceTaxExcluded,
      priceTaxIncluded,
      totalPrice,
      clientDiscount: clientTotalDiscount,
      clientPrice,
      companyPrice,
    }
  )
}
module.exports.calcRateByPrice = calcRateByPrice;