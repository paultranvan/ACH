const keyBy = require('lodash/keyBy')
const tz = require('timezone')
const eu = tz(require('timezone/Europe'))
const diff = require('jest-diff')
const mkAPI = require('./api')

const DOCTYPE_BANK_TRANSACTIONS = 'io.cozy.bank.operations'
const DOCTYPE_BANK_ACCOUNTS = 'io.cozy.bank.accounts'
const DOCTYPE_BANK_SETTINGS = 'io.cozy.bank.settings'

let client, api, log

const logWithInstance = function () {
  const args = [].slice.call(arguments)
  args.splice(0, 0, client._url.replace('https://', ''))
  console.log.apply(console, args)
}

const parisTime = date => {
  if (!date) { return }
  const epoch = tz(date)
  return eu(epoch, 'Europe/Paris', '%F %T%^z')
}

const migrateTransactionV1 = transaction => {
  const utransaction = {...transaction}
  utransaction.date = parisTime(transaction.date)
  if (transaction.dateOperation) {
    utransaction.dateOperation = parisTime(transaction.dateOperation)
  }
  utransaction.metadata = { version: 1 }
  return utransaction
}

const migrateAccountV1 = account => {
  const uaccount = {...account}
  uaccount.metadata = { version: 1 }
  return uaccount
}

const migrateSettingV1 = setting => {
  const usetting = {...setting}
  usetting.metadata = { version: 1 }
  return usetting
}

const migrateTransactionsV1 = docs => docs.map(migrateTransactionV1)
const migrateAccountsV1 = docs => docs.map(migrateAccountV1)
const migrateSettingsV1 = docs => docs.map(migrateSettingV1)

const doMigrations = async dryRun => {
  const accounts = (await api.fetchAll(DOCTYPE_BANK_ACCOUNTS, 'include_docs=true')).map(x => x.doc)
  const transactions = (await api.fetchAll(DOCTYPE_BANK_TRANSACTIONS, 'include_docs=true')).map(x => x.doc)
  const settings = (await api.fetchAll(DOCTYPE_BANK_SETTINGS, 'include_docs=true')).map(x => x.doc)

  const uaccounts = migrateAccountsV1(accounts)
  const utransactions = migrateTransactionsV1(transactions)
  const usettings = migrateSettingsV1(settings)


   if (!dryRun) {
    await api.updateAll(DOCTYPE_BANK_ACCOUNTS, uaccounts)
    await api.updateAll(DOCTYPE_BANK_TRANSACTIONS, utransactions)
    await api.updateAll(DOCTYPE_BANK_SETTINGS, usettings)
  } else {
    logWithInstance('Dry run: first updated account', diff(uaccounts[0], accounts[0]))
    logWithInstance('Dry run: first updated transaction', diff(utransactions[0], transactions[0]))
    logWithInstance('Dry run: first updated settings', diff(usettings[0], settings[0]))
  }

  logWithInstance(dryRun ? 'Would update' : 'Has updated', accounts.length, DOCTYPE_BANK_ACCOUNTS)
  logWithInstance(dryRun ? 'Would update' : 'Has updated', transactions.length, DOCTYPE_BANK_TRANSACTIONS)
  logWithInstance(dryRun ? 'Would update' : 'Has updated', settings.length, DOCTYPE_BANK_SETTINGS)
}

module.exports = {
  api: api,
  getDoctypes: function () {
    return [
      DOCTYPE_BANK_TRANSACTIONS,
      DOCTYPE_BANK_ACCOUNTS,
      DOCTYPE_BANK_SETTINGS
    ]
  },

  run: async function (ach, dryRun=true) {
    client = ach.client
    api = mkAPI(client)
    try {
      await doMigrations(dryRun)
    } catch (err) {
      console.log(ach.url, err)
    }
  }
}