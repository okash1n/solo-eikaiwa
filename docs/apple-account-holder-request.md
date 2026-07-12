# Account Holderへの依頼事項

最終確認日: 2026-07-11

## 目的

solo-eikaiwaのmacOSアプリについて、次の2つを進めるための依頼事項です。

- GitHub Releases版をDeveloper ID署名・Apple公証済みにする
- 将来Mac App Storeへ提出できる組織アカウント体制を整える

Account HolderのApple Account、パスワード、2要素認証コードを開発担当者へ共有する必要はありません。
Account Holder roleを移管する必要もありません。

## Account Holderにお願いする5項目

### 1. membershipと最新契約の確認

Apple DeveloperとApp Store ConnectへAccount Holder本人がログインし、次を確認してください。

- Apple Developer Program membershipが有効
- 未同意のApple Developer Program契約がない
- App Store ConnectのBusinessに対応待ちの契約がない

最新契約への同意はAccount Holderだけが行えます。契約が未同意だと、証明書、App Store Connect API、
アプリレコード作成、提出などが停止する場合があります。

### 2. 開発担当者をAdminとして招待

App Store Connectの「Users and Access」で、開発担当者のApple Accountを招待してください。

設定内容:

- Role: Admin（Full Access）
- Certificates, Identifiers & Profilesへアクセスできることを確認

Adminは広い権限を持ちます。組織方針上Adminを付与できない場合は、既存Adminが今後のApp ID、
distribution証明書、provisioning profile作成を代行する必要があります。

### 3. App Store Connect APIの初回利用申請

App Store Connectの「Users and Access > Integrations」を開いてください。

- 「Request Access」が表示される場合: Account Holderが規約を確認して申請
- Team Keys画面が既に利用可能な場合: 対応不要

初回利用申請はAccount Holderだけが行えます。APIが有効になった後は、招待されたAdminがTeam API Keyを作成できます。
秘密鍵をAccount Holderから開発担当者へ転送せず、開発担当者自身がキーを生成・保管する予定です。

### 4. Developer ID Application証明書の発行

開発担当者から渡す `.certSigningRequest` を使って、次の証明書を発行してください。

1. Apple Developerの「Certificates, Identifiers & Profiles」を開く
2. 「Certificates > +」を選択
3. 「Developer ID」を選択
4. 「Developer ID Application」を選択
5. 開発担当者から受け取ったCSRをアップロード
6. 生成された `.cer` をダウンロード
7. `.cer` を開発担当者へ返却

Developer ID Application証明書の通常発行はAccount Holderだけが行えます。

CSRは開発担当者のMacで作成します。対応する秘密鍵はそのMacのKeychainに残るため、Account Holderが
`.p12`、秘密鍵、Apple Accountのパスワードを渡す必要はありません。

### 5. 有料公開にする場合だけ契約・税務・銀行情報を設定

無料アプリとして公開する場合、この項目は不要です。

有料アプリまたはアプリ内課金を利用する場合は、Account Holderが次を完了してください。

- Paid Apps Agreementへの同意
- 税務情報
- 銀行口座情報

価格を決めていない場合は、先に無料で進めるか、組織内で方針を決めてから対応してください。

## Account Holderから返してもらうもの

- Admin招待の完了連絡
- 未同意契約がないことの確認
- App Store Connect APIの利用可否
- Developer ID Applicationの `.cer`
- Team ID
- App Storeに表示する組織名・開発者名が `Business Technology Association Japan` であることの確認
- 有料または無料の方針

`.cer` は証明書本体であり、開発担当者のMacにある秘密鍵と組み合わせて使用します。
Apple Accountのパスワード、2FAコード、秘密鍵は返却物に含めないでください。

## Account Holder側で行わなくてよいこと

Admin招待後は、原則として開発担当者が次を行います。

- App Store Connect Team API Keyの生成と保管
- Explicit App IDの登録
- Apple DistributionまたはMac App Distribution証明書の作成
- Mac Installer Distribution証明書の作成
- Mac App Store Connect provisioning profileの作成
- Developer ID署名、公証、GitHub Release
- App Store Connectへのbuild uploadとmetadata入力

App Reviewへの最終提出はAdminでも可能です。Account Holderにしかできない新しい契約同意が表示された場合だけ、
再度対応をお願いします。

## そのまま送れる依頼文

```text
solo-eikaiwaのmacOS版について、GitHub配布のDeveloper ID署名・Apple公証と、
将来のMac App Store提出を進めたいです。

Apple Account、パスワード、2FAコードの共有や、Account Holder roleの移管は不要です。
以下の対応だけお願いします。

1. Apple Developer Programのmembershipが有効で、未同意の最新契約がないことを確認
2. App Store ConnectのUsers and Accessで、私をAdminとして招待
   - Full Access
   - Certificates, Identifiers & Profilesへアクセス可能
3. Users and Access > IntegrationsでApp Store Connect APIが未有効ならRequest Access
4. 添付するCSRを使ってDeveloper ID Application証明書を発行し、.cerを返送
5. 有料公開にする場合だけPaid Apps Agreement、税務、銀行情報を完了

CSRは私のMacで作成しているため、Developer IDの秘密鍵は私のKeychainに残ります。
.p12、秘密鍵、Apple Accountのパスワードを共有してもらう必要はありません。

あわせて、次を教えてください。
- Team ID
- App Storeに表示する組織名・開発者名（想定: `Business Technology Association Japan`）
- 無料公開か有料公開か
```

## 完了チェックリスト

- [ ] membershipが有効
- [ ] 最新契約が同意済み
- [ ] 開発担当者をAdminとして招待済み
- [ ] Certificates, Identifiers & Profilesへアクセス可能
- [ ] App Store Connect APIが利用可能
- [ ] 開発担当者のCSRからDeveloper ID Applicationを発行済み
- [ ] `.cer` を開発担当者へ返却済み
- [ ] Team IDを共有済み
- [ ] Store表示名を確認済み
- [ ] 無料・有料の方針を確認済み
- [ ] 有料の場合のみ契約・税務・銀行情報を完了済み

## Apple公式資料

- [Apple Developer Programのroles](https://developer.apple.com/help/account/access/roles)
- [Developer ID certificateの作成](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [App Store Connect API](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api)
- [App Store Connectの契約](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/)
- [App Store Connectへのユーザー追加](https://developer.apple.com/help/app-store-connect/manage-your-team/add-and-edit-users/)
