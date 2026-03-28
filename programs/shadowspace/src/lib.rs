use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpiBuilder, UpdatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{
    Member, MembersArgs, AUTHORITY_FLAG, TX_LOGS_FLAG, TX_BALANCES_FLAG,
};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, ephemeral_accounts};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use session_keys::{Session, SessionToken, session_auth_or};

declare_id!("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

pub const PROFILE_SEED: &[u8] = b"profile";
pub const POST_SEED: &[u8] = b"post";
pub const CHAT_SEED: &[u8] = b"chat";
pub const MESSAGE_SEED: &[u8] = b"message";
pub const FOLLOW_SEED: &[u8] = b"follow";
pub const COMMENT_SEED: &[u8] = b"comment";
pub const REACTION_SEED: &[u8] = b"reaction";
pub const CONVERSATION_SEED: &[u8] = b"conversation";

pub const MAX_MESSAGE_LEN: usize = 280;

#[ephemeral]
#[program]
pub mod shadowspace {
    use super::*;
    use session_keys::SessionError;

    // ========== PROFILE ==========

    pub fn create_profile(
        ctx: Context<CreateProfile>,
        username: String,
        display_name: String,
        bio: String,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.user.key();
        profile.username = username;
        profile.display_name = display_name;
        profile.bio = bio;
        profile.is_private = false;
        profile.post_count = 0;
        profile.follower_count = 0;
        profile.following_count = 0;
        profile.active_conversation_count = 0;
        profile.created_at = Clock::get()?.unix_timestamp;
        msg!("Profile created for {}", profile.owner);
        Ok(())
    }

    pub fn update_profile_privacy(
        ctx: Context<UpdateProfilePrivacy>,
        is_private: bool,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.is_private = is_private;
        let owner_key = profile.owner;
        let permission_program = &ctx.accounts.permission_program.to_account_info();
        let permission = &ctx.accounts.permission.to_account_info();
        let (_, bump) = Pubkey::find_program_address(
            &[PROFILE_SEED, owner_key.as_ref()],
            &crate::ID,
        );
        if is_private {
            UpdatePermissionCpiBuilder::new(permission_program)
                .permissioned_account(&profile.to_account_info(), true)
                .authority(&profile.to_account_info(), false)
                .permission(permission)
                .args(MembersArgs {
                    members: Some(vec![Member {
                        flags: AUTHORITY_FLAG | TX_LOGS_FLAG | TX_BALANCES_FLAG,
                        pubkey: owner_key,
                    }]),
                })
                .invoke_signed(&[&[PROFILE_SEED, owner_key.as_ref(), &[bump]]])?;
        } else {
            UpdatePermissionCpiBuilder::new(permission_program)
                .permissioned_account(&profile.to_account_info(), true)
                .authority(&profile.to_account_info(), false)
                .permission(permission)
                .args(MembersArgs { members: None })
                .invoke_signed(&[&[PROFILE_SEED, owner_key.as_ref(), &[bump]]])?;
        }
        msg!("Profile privacy updated: private={}", is_private);
        Ok(())
    }

    /// Top up profile with lamports (to sponsor ephemeral conversations)
    pub fn top_up_profile(ctx: Context<TopUpProfile>, lamports: u64) -> Result<()> {
        require!(lamports > 0, ShadowError::InvalidAmount);
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.profile.to_account_info(),
                },
            ),
            lamports,
        )?;
        msg!("Profile topped up with {} lamports", lamports);
        Ok(())
    }

    /// Delegate profile to MagicBlock ER
    pub fn delegate_profile(
        ctx: Context<DelegateProfileCtx>,
        validator: Option<Pubkey>,
    ) -> Result<()> {
        let profile_seeds: &[&[u8]] = &[PROFILE_SEED, ctx.accounts.profile.owner.as_ref()];
        ctx.accounts.delegate_profile(
            &ctx.accounts.user,
            profile_seeds,
            DelegateConfig { validator, ..Default::default() },
        )?;
        msg!("Profile delegated to ER");
        Ok(())
    }

    /// Undelegate profile back to Solana
    pub fn undelegate_profile(ctx: Context<UndelegateProfileCtx>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.user,
            vec![&ctx.accounts.profile.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Profile undelegated");
        Ok(())
    }

    // ========== POSTS ==========

    #[session_auth_or(
        ctx.accounts.author.key() == ctx.accounts.author.key(),
        ShadowError::Unauthorized
    )]
    pub fn create_post(
        ctx: Context<CreatePost>,
        post_id: u64,
        content: String,
        is_private: bool,
    ) -> Result<()> {
        require!(content.len() <= 280, ShadowError::ContentTooLong);
        let post = &mut ctx.accounts.post;
        post.author = ctx.accounts.profile.owner;
        post.post_id = post_id;
        post.content = content;
        post.is_private = is_private;
        post.likes = 0;
        post.comment_count = 0;
        post.created_at = Clock::get()?.unix_timestamp;
        let profile = &mut ctx.accounts.profile;
        profile.post_count += 1;
        msg!("Post {} created, private={}", post_id, is_private);
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.user.key() == ctx.accounts.user.key(),
        ShadowError::Unauthorized
    )]
    pub fn like_post(ctx: Context<LikePost>, _post_id: u64) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.likes += 1;
        msg!("Post {} liked, total: {}", post.post_id, post.likes);
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.author.key() == ctx.accounts.author.key(),
        ShadowError::Unauthorized
    )]
    pub fn create_comment(
        ctx: Context<CreateComment>,
        _post_id: u64,
        comment_index: u64,
        content: String,
    ) -> Result<()> {
        require!(content.len() <= 140, ShadowError::ContentTooLong);
        let comment = &mut ctx.accounts.comment;
        comment.post = ctx.accounts.post.key();
        comment.author = ctx.accounts.commenter_profile.owner;
        comment.comment_index = comment_index;
        comment.content = content;
        comment.created_at = Clock::get()?.unix_timestamp;
        let post = &mut ctx.accounts.post;
        post.comment_count += 1;
        msg!("Comment {} on post {}", comment_index, post.post_id);
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.user.key() == ctx.accounts.user.key(),
        ShadowError::Unauthorized
    )]
    pub fn react_to_post(
        ctx: Context<ReactToPost>,
        _post_id: u64,
        reaction_type: u8,
    ) -> Result<()> {
        let reaction = &mut ctx.accounts.reaction;
        reaction.post = ctx.accounts.post.key();
        reaction.user = ctx.accounts.reactor_profile.owner;
        reaction.reaction_type = reaction_type;
        reaction.created_at = Clock::get()?.unix_timestamp;
        msg!("Reaction {} on post {}", reaction_type, _post_id);
        Ok(())
    }

    // ========== LEGACY CHAT (kept for backwards compat) ==========

    pub fn create_chat(ctx: Context<CreateChat>, chat_id: u64) -> Result<()> {
        let chat = &mut ctx.accounts.chat;
        chat.chat_id = chat_id;
        chat.user1 = ctx.accounts.user1.key();
        chat.user2 = ctx.accounts.user2.key();
        chat.message_count = 0;
        chat.created_at = Clock::get()?.unix_timestamp;
        msg!("Chat {} created", chat_id);
        Ok(())
    }

    pub fn send_message(
        ctx: Context<SendMessage>,
        chat_id: u64,
        message_index: u64,
        content: String,
        is_payment: bool,
        payment_amount: u64,
    ) -> Result<()> {
        let message = &mut ctx.accounts.message;
        message.chat_id = chat_id;
        message.sender = ctx.accounts.sender.key();
        message.content = content;
        message.is_payment = is_payment;
        message.payment_amount = payment_amount;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.message_index = message_index;
        let chat = &mut ctx.accounts.chat;
        chat.message_count += 1;
        msg!("Message sent in chat {}", chat_id);
        Ok(())
    }

    // ========== EPHEMERAL CONVERSATIONS (free, private, real-time) ==========

    /// Create an ephemeral conversation inside MagicBlock ER.
    /// Profile PDA sponsors the account rent inside the rollup.
    /// `message_capacity` — pre-allocate space for this many messages (avoids realloc).
    pub fn create_conversation(ctx: Context<CreateConversation>, message_capacity: u32) -> Result<()> {
        let profile = &mut ctx.accounts.profile_owner;
        profile.active_conversation_count = profile
            .active_conversation_count
            .checked_add(1)
            .ok_or(ShadowError::ConversationCountOverflow)?;

        let cap = message_capacity as usize;
        let total_space = 8 + Conversation::space_for_message_count(cap);
        ctx.accounts
            .create_ephemeral_conversation(total_space as u32)?;

        let conversation = Conversation {
            user1: ctx.accounts.profile_owner.owner,
            user2: ctx.accounts.profile_other.owner,
            bump: ctx.bumps.conversation,
            messages: Vec::new(),
        };
        let mut data = ctx.accounts.conversation.try_borrow_mut_data()?;
        conversation.try_serialize(&mut &mut data[..])?;

        msg!("Ephemeral conversation created with capacity for {} messages", cap);
        Ok(())
    }

    /// Extend conversation capacity
    pub fn extend_conversation(
        ctx: Context<ExtendConversation>,
        additional_messages: u32,
    ) -> Result<()> {
        require!(additional_messages > 0, ShadowError::InvalidAmount);
        let current_capacity =
            Conversation::message_capacity(ctx.accounts.conversation.to_account_info().data_len());
        let new_capacity = current_capacity + additional_messages as usize;
        ctx.accounts.resize_ephemeral_conversation(
            (8 + Conversation::space_for_message_count(new_capacity)) as u32,
        )?;
        msg!("Conversation extended by {} messages", additional_messages);
        Ok(())
    }

    /// Append a message — runs inside ER, FREE
    pub fn append_message(ctx: Context<AppendMessage>, body: String) -> Result<()> {
        require!(
            !body.is_empty() && body.len() <= MAX_MESSAGE_LEN,
            ShadowError::ContentTooLong
        );
        let conversation = &mut ctx.accounts.conversation;
        require!(
            ctx.accounts.sender.key() == conversation.user1
                || ctx.accounts.sender.key() == conversation.user2,
            ShadowError::Unauthorized
        );
        let required_size = 8 + Conversation::space_for_message_count(conversation.messages.len() + 1);
        require!(
            conversation.to_account_info().data_len() >= required_size,
            ShadowError::ConversationCapacityExceeded
        );
        conversation.messages.push(ConversationMessage {
            sender: ctx.accounts.sender.key(),
            body,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("Message appended, total: {}", conversation.messages.len());
        Ok(())
    }

    /// Close an ephemeral conversation
    pub fn close_conversation(ctx: Context<CloseConversation>) -> Result<()> {
        let profile = &mut ctx.accounts.profile_owner;
        profile.active_conversation_count = profile
            .active_conversation_count
            .saturating_sub(1);
        ctx.accounts.close_ephemeral_conversation()?;
        msg!("Ephemeral conversation closed");
        Ok(())
    }

    // ========== FOLLOW ==========

    pub fn follow_user(ctx: Context<FollowUser>) -> Result<()> {
        let follow = &mut ctx.accounts.follow_account;
        follow.follower = ctx.accounts.follower_profile.owner;
        follow.following = ctx.accounts.following_profile.owner;
        follow.created_at = Clock::get()?.unix_timestamp;

        let follower_profile = &mut ctx.accounts.follower_profile;
        follower_profile.following_count += 1;
        let following_profile = &mut ctx.accounts.following_profile;
        following_profile.follower_count += 1;

        msg!("{} followed {}", follow.follower, follow.following);
        Ok(())
    }

    pub fn unfollow_user(ctx: Context<UnfollowUser>) -> Result<()> {
        let follower_profile = &mut ctx.accounts.follower_profile;
        follower_profile.following_count = follower_profile.following_count.saturating_sub(1);
        let following_profile = &mut ctx.accounts.following_profile;
        following_profile.follower_count = following_profile.follower_count.saturating_sub(1);

        msg!("{} unfollowed {}", follower_profile.owner, following_profile.owner);
        Ok(())
    }

    // ========== DELEGATION & PERMISSIONS ==========

    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = derive_seeds(&account_type);
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig { validator, ..Default::default() },
        )?;
        msg!("PDA delegated to TEE");
        Ok(())
    }

    pub fn create_permission(
        ctx: Context<CreatePermission>,
        account_type: AccountType,
        members: Option<Vec<Member>>,
    ) -> Result<()> {
        let seed_data = derive_seeds(&account_type);
        let (_, bump) = Pubkey::find_program_address(
            &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );
        let mut seeds = seed_data.clone();
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
        CreatePermissionCpiBuilder::new(&ctx.accounts.permission_program)
            .permissioned_account(&ctx.accounts.permissioned_account.to_account_info())
            .permission(&ctx.accounts.permission)
            .payer(&ctx.accounts.payer)
            .system_program(&ctx.accounts.system_program)
            .args(MembersArgs { members })
            .invoke_signed(&[seed_refs.as_slice()])?;
        msg!("Permission created");
        Ok(())
    }

    pub fn undelegate(ctx: Context<Undelegate>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.account.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Account undelegated back to Solana");
        Ok(())
    }
}

// ========== ACCOUNT CONTEXT STRUCTS ==========

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(init_if_needed, payer = user, space = 8 + Profile::LEN, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfilePrivacy<'info> {
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Permission account
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct TopUpProfile<'info> {
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateProfileCtx<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, profile.owner.as_ref()], bump, del)]
    pub profile: Account<'info, Profile>,
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateProfileCtx<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, profile.owner.as_ref()], bump)]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct CreatePost<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Post::LEN, seeds = [POST_SEED, profile.owner.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(mut, seeds = [PROFILE_SEED, profile.owner.as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub author: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub session_token: Option<Account<'info, SessionToken>>,
}

impl<'info> Session<'info> for CreatePost<'info> {
    fn session_token(&self) -> Option<Account<'info, SessionToken>> { self.session_token.clone() }
    fn session_signer(&self) -> Signer<'info> { self.author.clone() }
    fn session_authority(&self) -> Pubkey { self.profile.owner }
    fn target_program(&self) -> Pubkey { crate::ID }
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct LikePost<'info> {
    #[account(mut, seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    /// The user's profile — used to resolve real wallet for session keys
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    pub user: Signer<'info>,
    pub session_token: Option<Account<'info, SessionToken>>,
}

impl<'info> Session<'info> for LikePost<'info> {
    fn session_token(&self) -> Option<Account<'info, SessionToken>> { self.session_token.clone() }
    fn session_signer(&self) -> Signer<'info> { self.user.clone() }
    fn session_authority(&self) -> Pubkey { self.profile.owner }
    fn target_program(&self) -> Pubkey { crate::ID }
}

#[derive(Accounts)]
#[instruction(post_id: u64, comment_index: u64)]
pub struct CreateComment<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Comment::LEN, seeds = [COMMENT_SEED, post.key().as_ref(), &comment_index.to_le_bytes()], bump)]
    pub comment: Account<'info, Comment>,
    #[account(mut, seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    /// The commenter's profile — used to resolve real wallet for session keys
    #[account(seeds = [PROFILE_SEED, commenter_profile.owner.as_ref()], bump)]
    pub commenter_profile: Account<'info, Profile>,
    #[account(mut)]
    pub author: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub session_token: Option<Account<'info, SessionToken>>,
}

impl<'info> Session<'info> for CreateComment<'info> {
    fn session_token(&self) -> Option<Account<'info, SessionToken>> { self.session_token.clone() }
    fn session_signer(&self) -> Signer<'info> { self.author.clone() }
    fn session_authority(&self) -> Pubkey { self.commenter_profile.owner }
    fn target_program(&self) -> Pubkey { crate::ID }
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct ReactToPost<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Reaction::LEN, seeds = [REACTION_SEED, post.key().as_ref(), reactor_profile.owner.as_ref()], bump)]
    pub reaction: Account<'info, Reaction>,
    #[account(seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    /// The reactor's profile — used to resolve real wallet for session keys + reaction PDA
    #[account(seeds = [PROFILE_SEED, reactor_profile.owner.as_ref()], bump)]
    pub reactor_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub session_token: Option<Account<'info, SessionToken>>,
}

impl<'info> Session<'info> for ReactToPost<'info> {
    fn session_token(&self) -> Option<Account<'info, SessionToken>> { self.session_token.clone() }
    fn session_signer(&self) -> Signer<'info> { self.user.clone() }
    fn session_authority(&self) -> Pubkey { self.reactor_profile.owner }
    fn target_program(&self) -> Pubkey { crate::ID }
}

#[derive(Accounts)]
#[instruction(chat_id: u64)]
pub struct CreateChat<'info> {
    #[account(init_if_needed, payer = user1, space = 8 + Chat::LEN, seeds = [CHAT_SEED, &chat_id.to_le_bytes()], bump)]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub user1: Signer<'info>,
    /// CHECK: Second chat participant
    pub user2: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(chat_id: u64, message_index: u64)]
pub struct SendMessage<'info> {
    #[account(init_if_needed, payer = sender, space = 8 + Message::LEN, seeds = [MESSAGE_SEED, &chat_id.to_le_bytes(), &message_index.to_le_bytes()], bump)]
    pub message: Account<'info, Message>,
    #[account(mut, seeds = [CHAT_SEED, &chat_id.to_le_bytes()], bump)]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub sender: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ========== EPHEMERAL CONVERSATION CONTEXTS ==========

#[ephemeral_accounts]
#[derive(Accounts)]
pub struct CreateConversation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, sponsor, seeds = [PROFILE_SEED, profile_owner.owner.as_ref()], bump)]
    pub profile_owner: Account<'info, Profile>,
    #[account(seeds = [PROFILE_SEED, profile_other.owner.as_ref()], bump)]
    pub profile_other: Account<'info, Profile>,
    /// CHECK: Ephemeral conversation PDA
    #[account(mut, eph, seeds = [CONVERSATION_SEED, profile_owner.owner.as_ref(), profile_other.owner.as_ref()], bump)]
    pub conversation: AccountInfo<'info>,
}

#[ephemeral_accounts]
#[derive(Accounts)]
pub struct ExtendConversation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, sponsor, seeds = [PROFILE_SEED, profile_sender.owner.as_ref()], bump)]
    pub profile_sender: Account<'info, Profile>,
    #[account(seeds = [PROFILE_SEED, profile_other.owner.as_ref()], bump)]
    pub profile_other: Account<'info, Profile>,
    /// CHECK: Ephemeral conversation PDA
    #[account(mut, eph, seeds = [CONVERSATION_SEED, profile_sender.owner.as_ref(), profile_other.owner.as_ref()], bump)]
    pub conversation: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AppendMessage<'info> {
    pub sender: Signer<'info>,
    #[account(mut)]
    pub conversation: Account<'info, Conversation>,
}

#[ephemeral_accounts]
#[derive(Accounts)]
pub struct CloseConversation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, sponsor, seeds = [PROFILE_SEED, profile_owner.owner.as_ref()], bump)]
    pub profile_owner: Account<'info, Profile>,
    #[account(seeds = [PROFILE_SEED, profile_other.owner.as_ref()], bump)]
    pub profile_other: Account<'info, Profile>,
    /// CHECK: Ephemeral conversation PDA
    #[account(mut, eph, seeds = [CONVERSATION_SEED, profile_owner.owner.as_ref(), profile_other.owner.as_ref()], bump)]
    pub conversation: AccountInfo<'info>,
}

// ========== FOLLOW CONTEXTS ==========

#[derive(Accounts)]
pub struct FollowUser<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + FollowAccount::LEN,
        seeds = [FOLLOW_SEED, follower_profile.owner.as_ref(), following_profile.owner.as_ref()],
        bump
    )]
    pub follow_account: Account<'info, FollowAccount>,
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub follower_profile: Account<'info, Profile>,
    #[account(mut, seeds = [PROFILE_SEED, following_profile.owner.as_ref()], bump)]
    pub following_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnfollowUser<'info> {
    #[account(
        mut,
        close = user,
        seeds = [FOLLOW_SEED, follower_profile.owner.as_ref(), following_profile.owner.as_ref()],
        bump
    )]
    pub follow_account: Account<'info, FollowAccount>,
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub follower_profile: Account<'info, Profile>,
    #[account(mut, seeds = [PROFILE_SEED, following_profile.owner.as_ref()], bump)]
    pub following_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
}

// ========== DELEGATION CONTEXTS ==========

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreatePermission<'info> {
    /// CHECK: Validated via permission program CPI
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: Checked by permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[commit]
#[derive(Accounts)]
pub struct Undelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Account to undelegate
    #[account(mut)]
    pub account: UncheckedAccount<'info>,
}

// ========== DATA ACCOUNTS ==========

#[account]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub is_private: bool,
    pub post_count: u64,
    pub follower_count: u64,
    pub following_count: u64,
    pub active_conversation_count: u64,
    pub created_at: i64,
}

impl Profile {
    // 32 + (4+32) + (4+64) + (4+256) + 1 + 8 + 8 + 8 + 8 + 8
    pub const LEN: usize = 32 + 4 + 32 + 4 + 64 + 4 + 256 + 1 + 8 + 8 + 8 + 8 + 8;
}

#[account]
pub struct Post {
    pub author: Pubkey,
    pub post_id: u64,
    pub content: String,
    pub is_private: bool,
    pub likes: u64,
    pub comment_count: u64,
    pub created_at: i64,
}

impl Post {
    // 32(author) + 8(post_id) + 4(str_prefix) + 280(content) + 1(private) + 8(likes) + 8(comments) + 8(timestamp)
    pub const LEN: usize = 32 + 8 + 4 + 280 + 1 + 8 + 8 + 8;
}

#[account]
pub struct Comment {
    pub post: Pubkey,
    pub author: Pubkey,
    pub comment_index: u64,
    pub content: String,
    pub created_at: i64,
}

impl Comment {
    // 32(post) + 32(author) + 8(index) + 4(str_prefix) + 140(content) + 8(timestamp)
    pub const LEN: usize = 32 + 32 + 8 + 4 + 140 + 8;
}

#[account]
pub struct Reaction {
    pub post: Pubkey,
    pub user: Pubkey,
    pub reaction_type: u8,
    pub created_at: i64,
}

impl Reaction {
    pub const LEN: usize = 32 + 32 + 1 + 8;
}

#[account]
pub struct Chat {
    pub chat_id: u64,
    pub user1: Pubkey,
    pub user2: Pubkey,
    pub message_count: u64,
    pub created_at: i64,
}

impl Chat {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8;
}

#[account]
pub struct Message {
    pub chat_id: u64,
    pub message_index: u64,
    pub sender: Pubkey,
    pub content: String,
    pub is_payment: bool,
    pub payment_amount: u64,
    pub timestamp: i64,
}

impl Message {
    pub const LEN: usize = 8 + 8 + 32 + 4 + 512 + 1 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConversationMessage {
    pub sender: Pubkey,
    pub body: String,
    pub timestamp: i64,
}

impl ConversationMessage {
    pub const INIT_SPACE: usize = 32 + 4 + MAX_MESSAGE_LEN + 8;
}

#[account]
pub struct Conversation {
    pub user1: Pubkey,
    pub user2: Pubkey,
    pub bump: u8,
    pub messages: Vec<ConversationMessage>,
}

impl Conversation {
    pub const BASE_SPACE: usize = 32 + 32 + 1 + 4;

    pub fn space_for_message_count(count: usize) -> usize {
        Self::BASE_SPACE + (count * ConversationMessage::INIT_SPACE)
    }

    pub fn message_capacity(data_len: usize) -> usize {
        if data_len <= 8 + Self::BASE_SPACE { return 0; }
        (data_len - 8 - Self::BASE_SPACE) / ConversationMessage::INIT_SPACE
    }
}

#[account]
pub struct FollowAccount {
    pub follower: Pubkey,
    pub following: Pubkey,
    pub created_at: i64,
}

impl FollowAccount {
    // 32(follower) + 32(following) + 8(timestamp)
    pub const LEN: usize = 32 + 32 + 8;
}

// ========== ENUMS & ERRORS ==========

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Profile { owner: Pubkey },
    Post { author: Pubkey, post_id: u64 },
    Chat { chat_id: u64 },
    Message { chat_id: u64, message_index: u64 },
    Follow { follower: Pubkey, following: Pubkey },
    Comment { post: Pubkey, comment_index: u64 },
    Reaction { post: Pubkey, user: Pubkey },
}

fn derive_seeds(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::Profile { owner } => vec![PROFILE_SEED.to_vec(), owner.to_bytes().to_vec()],
        AccountType::Post { author, post_id } => vec![POST_SEED.to_vec(), author.to_bytes().to_vec(), post_id.to_le_bytes().to_vec()],
        AccountType::Chat { chat_id } => vec![CHAT_SEED.to_vec(), chat_id.to_le_bytes().to_vec()],
        AccountType::Message { chat_id, message_index } => vec![MESSAGE_SEED.to_vec(), chat_id.to_le_bytes().to_vec(), message_index.to_le_bytes().to_vec()],
        AccountType::Follow { follower, following } => vec![FOLLOW_SEED.to_vec(), follower.to_bytes().to_vec(), following.to_bytes().to_vec()],
        AccountType::Comment { post, comment_index } => vec![COMMENT_SEED.to_vec(), post.to_bytes().to_vec(), comment_index.to_le_bytes().to_vec()],
        AccountType::Reaction { post, user } => vec![REACTION_SEED.to_vec(), post.to_bytes().to_vec(), user.to_bytes().to_vec()],
    }
}

#[error_code]
pub enum ShadowError {
    #[msg("Already following this user")]
    AlreadyFollowing,
    #[msg("Not following this user")]
    NotFollowing,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Content too long")]
    ContentTooLong,
    #[msg("Cannot follow yourself")]
    CannotFollowSelf,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Conversation count overflow")]
    ConversationCountOverflow,
    #[msg("Conversation capacity exceeded")]
    ConversationCapacityExceeded,
}
